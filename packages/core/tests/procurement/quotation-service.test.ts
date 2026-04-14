import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mock Prisma + audit (hoisted)
// ---------------------------------------------------------------------------

const { mockPrisma, mockAuditLog } = vi.hoisted(() => {
  const mockAuditLog = vi.fn().mockResolvedValue({});
  const mockPrisma: Record<string, any> = {
    quotation: {
      findFirst: vi.fn(),
      findUniqueOrThrow: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      count: vi.fn(),
    },
    quotationLineItem: {
      deleteMany: vi.fn().mockResolvedValue({}),
    },
    rFQ: {
      findUniqueOrThrow: vi.fn(),
    },
    rFQVendor: {
      findMany: vi.fn(),
    },
    rFQItem: {
      findMany: vi.fn(),
    },
  };
  mockPrisma.$transaction = vi.fn().mockImplementation((cbOrArr: any) => {
    if (typeof cbOrArr === 'function') return cbOrArr(mockPrisma);
    return Promise.all(cbOrArr);
  });
  return { mockPrisma, mockAuditLog };
});

vi.mock('@fmksa/db', () => ({ prisma: mockPrisma }));
vi.mock('../../src/audit/service', () => ({
  auditService: { log: (...args: unknown[]) => mockAuditLog(...args) },
}));

// ---------------------------------------------------------------------------
// Import after mocks
// ---------------------------------------------------------------------------

import {
  createQuotation,
  updateQuotation,
  transitionQuotation,
  getQuotation,
  listQuotations,
  deleteQuotation,
  compareQuotations,
} from '../../src/procurement/quotation/service';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const RFQ_ID = '00000000-0000-0000-0000-000000000001';
const VENDOR_ID = '00000000-0000-0000-0000-000000000002';
const PROJECT_ID = '00000000-0000-0000-0000-000000000003';
const ACTOR = 'test-user';

function fakeQuotation(overrides: Record<string, unknown> = {}) {
  return {
    id: 'q1',
    rfqId: RFQ_ID,
    vendorId: VENDOR_ID,
    quotationRef: null,
    receivedDate: new Date(),
    validUntil: new Date('2026-06-30'),
    totalAmount: { toString: () => '75000.00' },
    currency: 'SAR',
    deliveryTerms: null,
    paymentTerms: null,
    status: 'received',
    createdBy: ACTOR,
    createdAt: new Date(),
    updatedAt: new Date(),
    lineItems: [],
    rfq: { projectId: PROJECT_ID },
    vendor: { id: VENDOR_ID, name: 'Test Vendor' },
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Quotation Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // -- Create --

  it('creates quotation in received status', async () => {
    const created = fakeQuotation();
    mockPrisma.rFQ.findUniqueOrThrow.mockResolvedValue({ projectId: PROJECT_ID, status: 'issued' });
    mockPrisma.rFQVendor.findMany.mockResolvedValue([{ vendorId: VENDOR_ID }]);
    mockPrisma.quotation.findFirst.mockResolvedValue(null); // no existing quotation
    mockPrisma.quotation.create.mockResolvedValue(created);

    const result = await createQuotation({
      projectId: PROJECT_ID,
      rfqId: RFQ_ID,
      vendorId: VENDOR_ID,
      currency: 'SAR',
      totalAmount: 75000,
    }, ACTOR);

    expect(result.status).toBe('received');
    expect(mockAuditLog).toHaveBeenCalledTimes(1);
  });

  it('creates quotation with nested line items', async () => {
    const created = fakeQuotation({
      lineItems: [{ id: 'li1', itemDescription: 'Steel', unitPrice: 250, totalPrice: 25000 }],
    });
    mockPrisma.rFQ.findUniqueOrThrow.mockResolvedValue({ projectId: PROJECT_ID, status: 'issued' });
    mockPrisma.rFQVendor.findMany.mockResolvedValue([{ vendorId: VENDOR_ID }]);
    mockPrisma.quotation.findFirst.mockResolvedValue(null);
    mockPrisma.quotation.create.mockResolvedValue(created);

    const result = await createQuotation({
      projectId: PROJECT_ID,
      rfqId: RFQ_ID,
      vendorId: VENDOR_ID,
      currency: 'SAR',
      totalAmount: 25000,
      items: [{
        itemDescription: 'Steel',
        unit: 'ton',
        quantity: 100,
        unitPrice: 250,
        totalPrice: 25000,
      }],
    }, ACTOR);

    expect(result.lineItems).toHaveLength(1);
    const createCall = mockPrisma.quotation.create.mock.calls[0]![0] as any;
    expect(createCall.data.lineItems).toBeDefined();
  });

  // -- Create-path scope binding (Stabilization Slice B) --

  it('rejects create when RFQ belongs to a different project', async () => {
    mockPrisma.rFQ.findUniqueOrThrow.mockResolvedValue({ projectId: 'other-project-id', status: 'issued' });

    await expect(createQuotation({
      projectId: PROJECT_ID,
      rfqId: RFQ_ID,
      vendorId: VENDOR_ID,
      currency: 'SAR',
      totalAmount: 75000,
    }, ACTOR)).rejects.toThrow(/mismatched project scope/);
  });

  it('allows create when projectId is omitted (legacy compatibility)', async () => {
    const created = fakeQuotation();
    mockPrisma.rFQ.findUniqueOrThrow.mockResolvedValue({ projectId: PROJECT_ID, status: 'issued' });
    mockPrisma.rFQVendor.findMany.mockResolvedValue([{ vendorId: VENDOR_ID }]);
    mockPrisma.quotation.findFirst.mockResolvedValue(null);
    mockPrisma.quotation.create.mockResolvedValue(created);

    // projectId omitted from input — scope check passes (input.projectId is falsy)
    const result = await createQuotation({
      projectId: '' as any, // simulating absence
      rfqId: RFQ_ID,
      vendorId: VENDOR_ID,
      currency: 'SAR',
      totalAmount: 75000,
    }, ACTOR);

    expect(result).toBeDefined();
  });

  // -- Quotation identity invariant (Stabilization Slice B) --

  it('rejects create when active quotation from same vendor exists', async () => {
    mockPrisma.rFQ.findUniqueOrThrow.mockResolvedValue({ projectId: PROJECT_ID, status: 'issued' });
    mockPrisma.rFQVendor.findMany.mockResolvedValue([{ vendorId: VENDOR_ID }]);
    mockPrisma.quotation.findFirst.mockResolvedValue({
      id: 'existing-q',
      status: 'under_review',
    });

    await expect(createQuotation({
      projectId: PROJECT_ID,
      rfqId: RFQ_ID,
      vendorId: VENDOR_ID,
      currency: 'SAR',
      totalAmount: 75000,
    }, ACTOR)).rejects.toThrow(/One quotation per vendor per RFQ/);
  });

  it('allows create when previous quotation from same vendor was rejected', async () => {
    const created = fakeQuotation();
    mockPrisma.rFQ.findUniqueOrThrow.mockResolvedValue({ projectId: PROJECT_ID, status: 'issued' });
    mockPrisma.rFQVendor.findMany.mockResolvedValue([{ vendorId: VENDOR_ID }]);
    // findFirst with notIn: terminal → returns null (previous was rejected, not in active)
    mockPrisma.quotation.findFirst.mockResolvedValue(null);
    mockPrisma.quotation.create.mockResolvedValue(created);

    const result = await createQuotation({
      projectId: PROJECT_ID,
      rfqId: RFQ_ID,
      vendorId: VENDOR_ID,
      currency: 'SAR',
      totalAmount: 75000,
    }, ACTOR);

    expect(result.status).toBe('received');
  });

  // -- Update --

  it('updates quotation in received status', async () => {
    const existing = fakeQuotation({ status: 'received' });
    mockPrisma.quotation.findUniqueOrThrow.mockResolvedValue(existing);
    const updated = fakeQuotation({ status: 'received', totalAmount: { toString: () => '80000.00' } });
    mockPrisma.quotation.update.mockResolvedValue(updated);

    const result = await updateQuotation({ id: 'q1', totalAmount: 80000 }, ACTOR);
    expect(result).toBeDefined();
    expect(mockAuditLog).toHaveBeenCalledTimes(1);
  });

  it('rejects update on non-editable status', async () => {
    const existing = fakeQuotation({ status: 'under_review' });
    mockPrisma.quotation.findUniqueOrThrow.mockResolvedValue(existing);

    await expect(updateQuotation({ id: 'q1', totalAmount: 80000 }, ACTOR)).rejects.toThrow(
      /Cannot update quotation/,
    );
  });

  // -- Transitions --

  it('transitions received -> under_review (review)', async () => {
    const existing = fakeQuotation({ status: 'received' });
    mockPrisma.quotation.findUniqueOrThrow.mockResolvedValue(existing);
    const updated = fakeQuotation({ status: 'under_review' });
    mockPrisma.quotation.update.mockResolvedValue(updated);

    const result = await transitionQuotation('q1', 'review', ACTOR);
    expect(result.status).toBe('under_review');
  });

  it('transitions under_review -> shortlisted (shortlist)', async () => {
    const existing = fakeQuotation({ status: 'under_review' });
    mockPrisma.quotation.findUniqueOrThrow.mockResolvedValue(existing);
    const updated = fakeQuotation({ status: 'shortlisted' });
    mockPrisma.quotation.update.mockResolvedValue(updated);

    const result = await transitionQuotation('q1', 'shortlist', ACTOR);
    expect(result.status).toBe('shortlisted');
  });

  // 'award' removed from quotation actions — quotation award happens only
  // through RFQ award (award integrity invariant).
  it('rejects standalone award action on quotation', async () => {
    await expect(transitionQuotation('q1', 'award', ACTOR)).rejects.toThrow(
      /Unknown quotation action/,
    );
  });

  it('transitions shortlisted -> rejected (reject)', async () => {
    const existing = fakeQuotation({ status: 'shortlisted' });
    mockPrisma.quotation.findUniqueOrThrow.mockResolvedValue(existing);
    const updated = fakeQuotation({ status: 'rejected' });
    mockPrisma.quotation.update.mockResolvedValue(updated);

    const result = await transitionQuotation('q1', 'reject', ACTOR);
    expect(result.status).toBe('rejected');
  });

  it('transitions received -> expired (expire)', async () => {
    const existing = fakeQuotation({ status: 'received' });
    mockPrisma.quotation.findUniqueOrThrow.mockResolvedValue(existing);
    const updated = fakeQuotation({ status: 'expired' });
    mockPrisma.quotation.update.mockResolvedValue(updated);

    const result = await transitionQuotation('q1', 'expire', ACTOR);
    expect(result.status).toBe('expired');
  });

  it('rejects unknown action on quotation', async () => {
    await expect(transitionQuotation('q1', 'nonexistent', ACTOR)).rejects.toThrow(
      /Unknown quotation action/,
    );
  });

  it('rejects transition from terminal status (awarded)', async () => {
    const existing = fakeQuotation({ status: 'awarded' });
    mockPrisma.quotation.findUniqueOrThrow.mockResolvedValue(existing);

    await expect(transitionQuotation('q1', 'review', ACTOR)).rejects.toThrow(
      /Cannot transition quotation from terminal status/,
    );
  });

  // -- Get --

  it('returns quotation with includes', async () => {
    const quotation = fakeQuotation();
    mockPrisma.quotation.findUniqueOrThrow.mockResolvedValue(quotation);

    const result = await getQuotation('q1');
    expect(result).toBe(quotation);
    expect(mockPrisma.quotation.findUniqueOrThrow).toHaveBeenCalledWith({
      where: { id: 'q1' },
      include: { lineItems: true, vendor: true, rfq: true },
    });
  });

  // -- List --

  it('filters by rfqId and vendorId', async () => {
    mockPrisma.quotation.findMany.mockResolvedValue([]);
    mockPrisma.quotation.count.mockResolvedValue(0);

    await listQuotations({ rfqId: RFQ_ID, vendorId: VENDOR_ID });
    const call = mockPrisma.quotation.findMany.mock.calls[0]![0] as any;
    expect(call.where.rfqId).toBe(RFQ_ID);
    expect(call.where.vendorId).toBe(VENDOR_ID);
  });

  it('filters by project scope through rfq relation', async () => {
    mockPrisma.quotation.findMany.mockResolvedValue([]);
    mockPrisma.quotation.count.mockResolvedValue(0);

    await listQuotations({ projectId: PROJECT_ID });
    const call = mockPrisma.quotation.findMany.mock.calls[0]![0] as any;
    expect(call.where.rfq).toEqual({ projectId: PROJECT_ID });
  });

  // -- Delete --

  it('deletes received quotation', async () => {
    const existing = fakeQuotation({ status: 'received' });
    mockPrisma.quotation.findUniqueOrThrow.mockResolvedValue(existing);
    mockPrisma.quotation.delete.mockResolvedValue(existing);

    await deleteQuotation('q1', ACTOR);
    expect(mockPrisma.quotationLineItem.deleteMany).toHaveBeenCalledWith({ where: { quotationId: 'q1' } });
    expect(mockPrisma.quotation.delete).toHaveBeenCalledWith({ where: { id: 'q1' } });
  });

  it('rejects delete for non-received quotation', async () => {
    const existing = fakeQuotation({ status: 'under_review' });
    mockPrisma.quotation.findUniqueOrThrow.mockResolvedValue(existing);

    await expect(deleteQuotation('q1', ACTOR)).rejects.toThrow(/Cannot delete quotation/);
  });

  // -- Stabilization Slice C: RFQ-state guard --

  it('rejects create when RFQ is in draft status', async () => {
    mockPrisma.rFQ.findUniqueOrThrow.mockResolvedValue({ projectId: PROJECT_ID, status: 'draft' });
    mockPrisma.rFQVendor.findMany.mockResolvedValue([{ vendorId: VENDOR_ID }]);

    await expect(createQuotation({
      projectId: PROJECT_ID,
      rfqId: RFQ_ID,
      vendorId: VENDOR_ID,
      currency: 'SAR',
      totalAmount: 75000,
    }, ACTOR)).rejects.toThrow(/Cannot create quotation for RFQ.*status 'draft'/);
  });

  it('rejects create when RFQ is in under_review status', async () => {
    mockPrisma.rFQ.findUniqueOrThrow.mockResolvedValue({ projectId: PROJECT_ID, status: 'under_review' });
    mockPrisma.rFQVendor.findMany.mockResolvedValue([{ vendorId: VENDOR_ID }]);

    await expect(createQuotation({
      projectId: PROJECT_ID,
      rfqId: RFQ_ID,
      vendorId: VENDOR_ID,
      currency: 'SAR',
      totalAmount: 75000,
    }, ACTOR)).rejects.toThrow(/Cannot create quotation for RFQ.*status 'under_review'/);
  });

  it('allows create when RFQ is in responses_received status', async () => {
    const created = fakeQuotation();
    mockPrisma.rFQ.findUniqueOrThrow.mockResolvedValue({ projectId: PROJECT_ID, status: 'responses_received' });
    mockPrisma.rFQVendor.findMany.mockResolvedValue([{ vendorId: VENDOR_ID }]);
    mockPrisma.quotation.findFirst.mockResolvedValue(null);
    mockPrisma.quotation.create.mockResolvedValue(created);

    const result = await createQuotation({
      projectId: PROJECT_ID,
      rfqId: RFQ_ID,
      vendorId: VENDOR_ID,
      currency: 'SAR',
      totalAmount: 75000,
    }, ACTOR);

    expect(result.status).toBe('received');
  });

  // -- Stabilization Slice C: vendor eligibility guard --

  it('rejects create when vendor is not invited on the RFQ', async () => {
    mockPrisma.rFQ.findUniqueOrThrow.mockResolvedValue({ projectId: PROJECT_ID, status: 'issued' });
    mockPrisma.rFQVendor.findMany.mockResolvedValue([{ vendorId: 'other-vendor-id' }]); // different vendor

    await expect(createQuotation({
      projectId: PROJECT_ID,
      rfqId: RFQ_ID,
      vendorId: VENDOR_ID,
      currency: 'SAR',
      totalAmount: 75000,
    }, ACTOR)).rejects.toThrow(/not invited on RFQ/);
  });

  // -- Stabilization Slice C: rfqItemId validation --

  it('rejects create when quotation references invalid rfqItemId', async () => {
    mockPrisma.rFQ.findUniqueOrThrow.mockResolvedValue({ projectId: PROJECT_ID, status: 'issued' });
    mockPrisma.rFQVendor.findMany.mockResolvedValue([{ vendorId: VENDOR_ID }]);
    mockPrisma.quotation.findFirst.mockResolvedValue(null);
    mockPrisma.rFQItem.findMany.mockResolvedValue([]); // no valid RFQ items

    await expect(createQuotation({
      projectId: PROJECT_ID,
      rfqId: RFQ_ID,
      vendorId: VENDOR_ID,
      currency: 'SAR',
      totalAmount: 25000,
      items: [{
        rfqItemId: 'nonexistent-item-id',
        itemDescription: 'Steel',
        unit: 'ton',
        quantity: 100,
        unitPrice: 250,
        totalPrice: 25000,
      }],
    }, ACTOR)).rejects.toThrow(/invalid RFQ item IDs/);
  });

  it('allows create with valid rfqItemId references', async () => {
    const created = fakeQuotation();
    mockPrisma.rFQ.findUniqueOrThrow.mockResolvedValue({ projectId: PROJECT_ID, status: 'issued' });
    mockPrisma.rFQVendor.findMany.mockResolvedValue([{ vendorId: VENDOR_ID }]);
    mockPrisma.quotation.findFirst.mockResolvedValue(null);
    mockPrisma.rFQItem.findMany.mockResolvedValue([{ id: 'ri1' }]); // valid RFQ item
    mockPrisma.quotation.create.mockResolvedValue(created);

    const result = await createQuotation({
      projectId: PROJECT_ID,
      rfqId: RFQ_ID,
      vendorId: VENDOR_ID,
      currency: 'SAR',
      totalAmount: 25000,
      items: [{
        rfqItemId: 'ri1',
        itemDescription: 'Steel',
        unit: 'ton',
        quantity: 100,
        unitPrice: 250,
        totalPrice: 25000,
      }],
    }, ACTOR);

    expect(result).toBeDefined();
  });

  // -- Compare quotations --

  it('builds comparison matrix from RFQ items and quotation line items', async () => {
    mockPrisma.quotation.findMany.mockResolvedValue([
      {
        id: 'q1',
        vendorId: 'v1',
        vendor: { name: 'Vendor A' },
        lineItems: [
          { rfqItemId: 'ri1', unitPrice: { toString: () => '250' }, totalPrice: { toString: () => '25000' }, quantity: { toString: () => '100' } },
        ],
      },
      {
        id: 'q2',
        vendorId: 'v2',
        vendor: { name: 'Vendor B' },
        lineItems: [
          { rfqItemId: 'ri1', unitPrice: { toString: () => '280' }, totalPrice: { toString: () => '28000' }, quantity: { toString: () => '100' } },
        ],
      },
    ]);
    mockPrisma.rFQItem.findMany.mockResolvedValue([
      { id: 'ri1', itemDescription: 'Steel bars', quantity: { toString: () => '100' }, unit: 'ton' },
    ]);

    const result = await compareQuotations(RFQ_ID);
    expect(result).toHaveLength(1);
    expect(result[0]!.rfqItem.itemDescription).toBe('Steel bars');
    expect(result[0]!.vendors).toHaveLength(2);
    expect(result[0]!.vendors[0]!.vendorName).toBe('Vendor A');
    expect(result[0]!.vendors[0]!.unitPrice).toBe(250);
    expect(result[0]!.vendors[1]!.vendorName).toBe('Vendor B');
    expect(result[0]!.vendors[1]!.unitPrice).toBe(280);
  });
});
