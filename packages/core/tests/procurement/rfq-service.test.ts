import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mock Prisma + audit (hoisted)
// ---------------------------------------------------------------------------

const { mockPrisma, mockAuditLog, mockPrismaNamespace } = vi.hoisted(() => {
  const mockAuditLog = vi.fn().mockResolvedValue({});
  const mockPrisma: Record<string, any> = {
    rFQ: {
      findFirst: vi.fn(),
      findUniqueOrThrow: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      count: vi.fn(),
    },
    rFQItem: {
      deleteMany: vi.fn().mockResolvedValue({}),
    },
    rFQVendor: {
      deleteMany: vi.fn().mockResolvedValue({}),
      upsert: vi.fn(),
    },
  };
  mockPrisma.$transaction = vi.fn().mockImplementation((cbOrArr: any) => {
    if (typeof cbOrArr === 'function') return cbOrArr(mockPrisma);
    return Promise.all(cbOrArr);
  });
  class PrismaClientKnownRequestError extends Error {
    code: string;
    constructor(message: string, { code }: { code: string }) {
      super(message);
      this.code = code;
    }
  }
  const mockPrismaNamespace = { PrismaClientKnownRequestError };
  return { mockPrisma, mockAuditLog, mockPrismaNamespace };
});

vi.mock('@fmksa/db', () => ({ prisma: mockPrisma, Prisma: mockPrismaNamespace }));
vi.mock('../../src/audit/service', () => ({
  auditService: { log: (...args: unknown[]) => mockAuditLog(...args) },
}));

// ---------------------------------------------------------------------------
// Import after mocks
// ---------------------------------------------------------------------------

import {
  createRfq,
  updateRfq,
  transitionRfq,
  getRfq,
  listRfqs,
  deleteRfq,
  inviteVendors,
} from '../../src/procurement/rfq/service';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const PROJECT_ID = '00000000-0000-0000-0000-000000000001';
const VENDOR_ID = '00000000-0000-0000-0000-000000000002';
const ACTOR = 'test-user';

function fakeRfq(overrides: Record<string, unknown> = {}) {
  return {
    id: 'rfq1',
    projectId: PROJECT_ID,
    rfqNumber: 'RFQ-0001',
    title: 'Test RFQ',
    description: null,
    requiredByDate: new Date('2026-06-01'),
    categoryId: null,
    currency: 'SAR',
    estimatedBudget: null,
    status: 'draft',
    referenceNumber: null,
    createdBy: ACTOR,
    createdAt: new Date(),
    updatedAt: new Date(),
    items: [],
    rfqVendors: [],
    project: { id: PROJECT_ID, entityId: 'e1' },
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('RFQ Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // -- Create --

  it('creates RFQ in draft status with auto-generated rfqNumber', async () => {
    mockPrisma.rFQ.findFirst.mockResolvedValue(null);
    const created = fakeRfq();
    mockPrisma.rFQ.create.mockResolvedValue(created);

    const result = await createRfq({
      projectId: PROJECT_ID,
      title: 'Test RFQ',
      currency: 'SAR',
      deadline: '2026-06-01T00:00:00.000Z',
    }, ACTOR);

    expect(result.status).toBe('draft');
    expect(result.rfqNumber).toBe('RFQ-0001');
    expect(mockAuditLog).toHaveBeenCalledTimes(1);
  });

  it('creates RFQ with nested items and vendor invitations', async () => {
    mockPrisma.rFQ.findFirst.mockResolvedValue(null);
    const created = fakeRfq({
      items: [{ id: 'ri1', itemDescription: 'Steel' }],
      rfqVendors: [{ id: 'rv1', vendorId: VENDOR_ID }],
    });
    mockPrisma.rFQ.create.mockResolvedValue(created);

    const result = await createRfq({
      projectId: PROJECT_ID,
      title: 'With Items',
      currency: 'SAR',
      deadline: '2026-06-01T00:00:00.000Z',
      items: [{
        itemDescription: 'Steel',
        unit: 'ton',
        quantity: 100,
      }],
      invitedVendorIds: [VENDOR_ID],
    }, ACTOR);

    expect(result.items).toHaveLength(1);
    expect(result.rfqVendors).toHaveLength(1);
  });

  it('retries on P2002 unique violation', async () => {
    const error = new mockPrismaNamespace.PrismaClientKnownRequestError('Unique constraint', { code: 'P2002' });
    mockPrisma.rFQ.findFirst.mockResolvedValue(null);
    mockPrisma.rFQ.create.mockRejectedValueOnce(error);
    const created = fakeRfq();
    mockPrisma.rFQ.create.mockResolvedValueOnce(created);

    const result = await createRfq({
      projectId: PROJECT_ID,
      title: 'Test',
      currency: 'SAR',
      deadline: '2026-06-01T00:00:00.000Z',
    }, ACTOR);

    expect(result).toBeDefined();
    expect(mockPrisma.$transaction).toHaveBeenCalledTimes(2);
  });

  // -- Update --

  it('updates RFQ in draft status', async () => {
    const existing = fakeRfq({ status: 'draft' });
    mockPrisma.rFQ.findUniqueOrThrow.mockResolvedValue(existing);
    const updated = fakeRfq({ status: 'draft', title: 'Updated' });
    mockPrisma.rFQ.update.mockResolvedValue(updated);

    const result = await updateRfq({ id: 'rfq1', title: 'Updated' }, ACTOR, PROJECT_ID);
    expect(result.title).toBe('Updated');
    expect(mockAuditLog).toHaveBeenCalledTimes(1);
  });

  it('rejects update on non-editable status', async () => {
    const existing = fakeRfq({ status: 'issued' });
    mockPrisma.rFQ.findUniqueOrThrow.mockResolvedValue(existing);

    await expect(updateRfq({ id: 'rfq1', title: 'Nope' }, ACTOR, PROJECT_ID)).rejects.toThrow(
      /Cannot update RFQ/,
    );
  });

  // -- Transitions --

  it('transitions draft -> under_review (submit)', async () => {
    const existing = fakeRfq({ status: 'draft' });
    mockPrisma.rFQ.findUniqueOrThrow.mockResolvedValue(existing);
    const updated = fakeRfq({ status: 'under_review' });
    mockPrisma.rFQ.update.mockResolvedValue(updated);

    const result = await transitionRfq('rfq1', 'submit', ACTOR);
    expect(result.status).toBe('under_review');
  });

  it('transitions approved_internal -> issued (issue) and assigns referenceNumber', async () => {
    const existing = fakeRfq({ status: 'approved_internal' });
    mockPrisma.rFQ.findUniqueOrThrow.mockResolvedValue(existing);
    mockPrisma.rFQ.findFirst.mockResolvedValue(null); // no existing refs
    const updated = fakeRfq({ status: 'issued', referenceNumber: 'RFQ-0001' });
    mockPrisma.rFQ.update.mockResolvedValue(updated);

    const result = await transitionRfq('rfq1', 'issue', ACTOR);
    expect(result.status).toBe('issued');
    expect(result.referenceNumber).toBe('RFQ-0001');
  });

  it('transitions issued -> responses_received', async () => {
    const existing = fakeRfq({ status: 'issued' });
    mockPrisma.rFQ.findUniqueOrThrow.mockResolvedValue(existing);
    const updated = fakeRfq({ status: 'responses_received' });
    mockPrisma.rFQ.update.mockResolvedValue(updated);

    const result = await transitionRfq('rfq1', 'receive_responses', ACTOR);
    expect(result.status).toBe('responses_received');
  });

  it('transitions evaluation -> awarded (award)', async () => {
    const existing = fakeRfq({ status: 'evaluation' });
    mockPrisma.rFQ.findUniqueOrThrow.mockResolvedValue(existing);
    const updated = fakeRfq({ status: 'awarded' });
    mockPrisma.rFQ.update.mockResolvedValue(updated);

    const result = await transitionRfq('rfq1', 'award', ACTOR);
    expect(result.status).toBe('awarded');
  });

  it('transitions evaluation -> cancelled (cancel)', async () => {
    const existing = fakeRfq({ status: 'evaluation' });
    mockPrisma.rFQ.findUniqueOrThrow.mockResolvedValue(existing);
    const updated = fakeRfq({ status: 'cancelled' });
    mockPrisma.rFQ.update.mockResolvedValue(updated);

    const result = await transitionRfq('rfq1', 'cancel', ACTOR);
    expect(result.status).toBe('cancelled');
  });

  it('rejects invalid transition draft -> issued', async () => {
    const existing = fakeRfq({ status: 'draft' });
    mockPrisma.rFQ.findUniqueOrThrow.mockResolvedValue(existing);

    await expect(transitionRfq('rfq1', 'issue', ACTOR)).rejects.toThrow(
      /Invalid RFQ transition/,
    );
  });

  it('rejects transition from terminal status (rejected)', async () => {
    const existing = fakeRfq({ status: 'rejected' });
    mockPrisma.rFQ.findUniqueOrThrow.mockResolvedValue(existing);

    await expect(transitionRfq('rfq1', 'submit', ACTOR)).rejects.toThrow(
      /Cannot transition RFQ from terminal status/,
    );
  });

  // -- Get --

  it('returns RFQ with includes', async () => {
    const rfq = fakeRfq({ quotations: [] });
    mockPrisma.rFQ.findUniqueOrThrow.mockResolvedValue(rfq);

    const result = await getRfq('rfq1', PROJECT_ID);
    expect(result).toBe(rfq);
    expect(mockPrisma.rFQ.findUniqueOrThrow).toHaveBeenCalledWith({
      where: { id: 'rfq1' },
      include: { items: true, rfqVendors: { include: { vendor: true } }, quotations: true },
    });
  });

  // -- List --

  it('applies project and category filters', async () => {
    mockPrisma.rFQ.findMany.mockResolvedValue([]);
    mockPrisma.rFQ.count.mockResolvedValue(0);

    await listRfqs({ projectId: PROJECT_ID, categoryId: 'cat1', skip: 0, take: 20, sortDirection: 'desc' });
    const call = mockPrisma.rFQ.findMany.mock.calls[0]![0] as any;
    expect(call.where.projectId).toBe(PROJECT_ID);
    expect(call.where.categoryId).toBe('cat1');
  });

  // -- Delete --

  it('deletes draft RFQ', async () => {
    const existing = fakeRfq({ status: 'draft' });
    mockPrisma.rFQ.findUniqueOrThrow.mockResolvedValue(existing);
    mockPrisma.rFQ.delete.mockResolvedValue(existing);

    await deleteRfq('rfq1', ACTOR, PROJECT_ID);
    expect(mockPrisma.rFQItem.deleteMany).toHaveBeenCalledWith({ where: { rfqId: 'rfq1' } });
    expect(mockPrisma.rFQVendor.deleteMany).toHaveBeenCalledWith({ where: { rfqId: 'rfq1' } });
    expect(mockPrisma.rFQ.delete).toHaveBeenCalledWith({ where: { id: 'rfq1' } });
  });

  it('rejects delete for non-draft RFQ', async () => {
    const existing = fakeRfq({ status: 'issued' });
    mockPrisma.rFQ.findUniqueOrThrow.mockResolvedValue(existing);

    await expect(deleteRfq('rfq1', ACTOR, PROJECT_ID)).rejects.toThrow(/Cannot delete RFQ/);
  });

  // -- Invite vendors --

  it('invites vendors to RFQ', async () => {
    mockPrisma.rFQ.findUniqueOrThrow.mockResolvedValue(fakeRfq({ status: 'issued' }));
    const upserted = { id: 'rv1', rfqId: 'rfq1', vendorId: VENDOR_ID };
    mockPrisma.rFQVendor.upsert.mockResolvedValue(upserted);

    const result = await inviteVendors('rfq1', [VENDOR_ID], ACTOR);
    expect(result).toHaveLength(1);
    expect(mockAuditLog).toHaveBeenCalledTimes(1);
  });

  it('rejects vendor invitation when status does not allow', async () => {
    mockPrisma.rFQ.findUniqueOrThrow.mockResolvedValue(fakeRfq({ status: 'awarded' }));

    await expect(inviteVendors('rfq1', [VENDOR_ID], ACTOR)).rejects.toThrow(
      /Cannot invite vendors/,
    );
  });
});
