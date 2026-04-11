import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mock Prisma + audit (hoisted)
// ---------------------------------------------------------------------------

const { mockPrisma, mockAuditLog, mockPrismaNamespace } = vi.hoisted(() => {
  const mockAuditLog = vi.fn().mockResolvedValue({});
  const mockPrisma: Record<string, any> = {
    frameworkAgreement: {
      findFirst: vi.fn(),
      findUniqueOrThrow: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      count: vi.fn(),
    },
    frameworkAgreementItem: {
      deleteMany: vi.fn().mockResolvedValue({}),
    },
    purchaseOrder: {
      aggregate: vi.fn(),
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
vi.mock('../../src/posting/service', () => ({
  postingService: { post: vi.fn() },
}));

// ---------------------------------------------------------------------------
// Import after mocks
// ---------------------------------------------------------------------------

import {
  createFrameworkAgreement,
  updateFrameworkAgreement,
  transitionFrameworkAgreement,
  getFrameworkAgreement,
  listFrameworkAgreements,
  deleteFrameworkAgreement,
  getUtilization,
} from '../../src/procurement/framework-agreement/service';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ENTITY_ID = '00000000-0000-0000-0000-000000000001';
const VENDOR_ID = '00000000-0000-0000-0000-000000000002';
const PROJECT_ID = '00000000-0000-0000-0000-000000000003';
const ACTOR = 'test-user';

function fakeAgreement(overrides: Record<string, unknown> = {}) {
  return {
    id: 'fa1',
    entityId: ENTITY_ID,
    vendorId: VENDOR_ID,
    projectId: PROJECT_ID,
    agreementNumber: 'FA-0001',
    title: 'Test Agreement',
    description: null,
    validFrom: new Date('2026-01-01'),
    validTo: new Date('2026-12-31'),
    currency: 'SAR',
    totalCommittedValue: { toString: () => '500000.00' },
    status: 'draft',
    createdBy: ACTOR,
    createdAt: new Date(),
    updatedAt: new Date(),
    items: [],
    vendor: { id: VENDOR_ID, name: 'Test Vendor' },
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('FrameworkAgreement Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // -- Create --

  it('creates framework agreement in draft status with auto-generated agreementNumber', async () => {
    mockPrisma.frameworkAgreement.findFirst.mockResolvedValue(null);
    const created = fakeAgreement();
    mockPrisma.frameworkAgreement.create.mockResolvedValue(created);

    const result = await createFrameworkAgreement({
      entityId: ENTITY_ID,
      vendorId: VENDOR_ID,
      projectId: PROJECT_ID,
      title: 'Test Agreement',
      validFrom: '2026-01-01T00:00:00.000Z',
      validTo: '2026-12-31T00:00:00.000Z',
      currency: 'SAR',
    }, ACTOR);

    expect(result.status).toBe('draft');
    expect(result.agreementNumber).toBe('FA-0001');
    expect(mockAuditLog).toHaveBeenCalledTimes(1);
  });

  it('creates framework agreement with nested items', async () => {
    mockPrisma.frameworkAgreement.findFirst.mockResolvedValue(null);
    const created = fakeAgreement({ items: [{ id: 'fai1', itemDescription: 'Steel' }] });
    mockPrisma.frameworkAgreement.create.mockResolvedValue(created);

    const result = await createFrameworkAgreement({
      entityId: ENTITY_ID,
      vendorId: VENDOR_ID,
      title: 'With Items',
      validFrom: '2026-01-01T00:00:00.000Z',
      validTo: '2026-12-31T00:00:00.000Z',
      currency: 'SAR',
      items: [{
        itemDescription: 'Steel',
        unit: 'ton',
        agreedRate: 2500,
        currency: 'SAR',
      }],
    }, ACTOR);

    expect(result.items).toHaveLength(1);
    const createCall = mockPrisma.frameworkAgreement.create.mock.calls[0]![0] as any;
    expect(createCall.data.items).toBeDefined();
  });

  it('creates entity-wide agreement with null projectId', async () => {
    mockPrisma.frameworkAgreement.findFirst.mockResolvedValue(null);
    const created = fakeAgreement({ projectId: null });
    mockPrisma.frameworkAgreement.create.mockResolvedValue(created);

    const result = await createFrameworkAgreement({
      entityId: ENTITY_ID,
      vendorId: VENDOR_ID,
      title: 'Entity-wide',
      validFrom: '2026-01-01T00:00:00.000Z',
      validTo: '2026-12-31T00:00:00.000Z',
      currency: 'SAR',
    }, ACTOR);

    expect(result.projectId).toBeNull();
  });

  it('retries on P2002 unique violation', async () => {
    const error = new mockPrismaNamespace.PrismaClientKnownRequestError('Unique constraint', { code: 'P2002' });
    mockPrisma.frameworkAgreement.findFirst.mockResolvedValue(null);
    mockPrisma.frameworkAgreement.create.mockRejectedValueOnce(error);
    const created = fakeAgreement();
    mockPrisma.frameworkAgreement.create.mockResolvedValueOnce(created);

    const result = await createFrameworkAgreement({
      entityId: ENTITY_ID,
      vendorId: VENDOR_ID,
      title: 'Test',
      validFrom: '2026-01-01T00:00:00.000Z',
      validTo: '2026-12-31T00:00:00.000Z',
      currency: 'SAR',
    }, ACTOR);

    expect(result).toBeDefined();
    expect(mockPrisma.$transaction).toHaveBeenCalledTimes(2);
  });

  // -- Update --

  it('updates framework agreement in draft status', async () => {
    const existing = fakeAgreement({ status: 'draft' });
    mockPrisma.frameworkAgreement.findUniqueOrThrow.mockResolvedValue(existing);
    const updated = fakeAgreement({ status: 'draft', title: 'Updated' });
    mockPrisma.frameworkAgreement.update.mockResolvedValue(updated);

    const result = await updateFrameworkAgreement({ id: 'fa1', title: 'Updated' }, ACTOR);
    expect(result.title).toBe('Updated');
    expect(mockAuditLog).toHaveBeenCalledTimes(1);
  });

  it('rejects update on non-editable status', async () => {
    const existing = fakeAgreement({ status: 'active' });
    mockPrisma.frameworkAgreement.findUniqueOrThrow.mockResolvedValue(existing);

    await expect(updateFrameworkAgreement({ id: 'fa1', title: 'Nope' }, ACTOR)).rejects.toThrow(
      /Cannot update framework agreement/,
    );
  });

  // -- Transitions --

  it('transitions draft -> under_review (submit)', async () => {
    const existing = fakeAgreement({ status: 'draft' });
    mockPrisma.frameworkAgreement.findUniqueOrThrow.mockResolvedValue(existing);
    const updated = fakeAgreement({ status: 'under_review' });
    mockPrisma.frameworkAgreement.update.mockResolvedValue(updated);

    const result = await transitionFrameworkAgreement('fa1', 'submit', ACTOR);
    expect(result.status).toBe('under_review');
  });

  it('transitions under_review -> approved_internal (approve)', async () => {
    const existing = fakeAgreement({ status: 'under_review' });
    mockPrisma.frameworkAgreement.findUniqueOrThrow.mockResolvedValue(existing);
    const updated = fakeAgreement({ status: 'approved_internal' });
    mockPrisma.frameworkAgreement.update.mockResolvedValue(updated);

    const result = await transitionFrameworkAgreement('fa1', 'approve', ACTOR);
    expect(result.status).toBe('approved_internal');
  });

  it('transitions signed -> active (activate) — emits audit-only, no posting', async () => {
    const existing = fakeAgreement({ status: 'signed' });
    mockPrisma.frameworkAgreement.findUniqueOrThrow.mockResolvedValue(existing);
    const updated = fakeAgreement({ status: 'active' });
    mockPrisma.frameworkAgreement.update.mockResolvedValue(updated);

    const result = await transitionFrameworkAgreement('fa1', 'activate', ACTOR);
    expect(result.status).toBe('active');

    // Should have 2 audit logs: transition + FRAMEWORK_AGREEMENT_ACTIVE
    expect(mockAuditLog).toHaveBeenCalledTimes(2);
    const secondAuditCall = mockAuditLog.mock.calls[1]![0] as any;
    expect(secondAuditCall.action).toBe('FRAMEWORK_AGREEMENT_ACTIVE');
  });

  it('transitions active -> terminated (terminate)', async () => {
    const existing = fakeAgreement({ status: 'active' });
    mockPrisma.frameworkAgreement.findUniqueOrThrow.mockResolvedValue(existing);
    const updated = fakeAgreement({ status: 'terminated' });
    mockPrisma.frameworkAgreement.update.mockResolvedValue(updated);

    const result = await transitionFrameworkAgreement('fa1', 'terminate', ACTOR);
    expect(result.status).toBe('terminated');
  });

  it('rejects invalid transition draft -> signed', async () => {
    const existing = fakeAgreement({ status: 'draft' });
    mockPrisma.frameworkAgreement.findUniqueOrThrow.mockResolvedValue(existing);

    await expect(transitionFrameworkAgreement('fa1', 'sign', ACTOR)).rejects.toThrow(
      /Invalid framework agreement transition/,
    );
  });

  it('rejects transition from terminal status (rejected)', async () => {
    const existing = fakeAgreement({ status: 'rejected' });
    mockPrisma.frameworkAgreement.findUniqueOrThrow.mockResolvedValue(existing);

    await expect(transitionFrameworkAgreement('fa1', 'submit', ACTOR)).rejects.toThrow(
      /Cannot transition framework agreement from terminal status/,
    );
  });

  it('rejects unknown action', async () => {
    await expect(transitionFrameworkAgreement('fa1', 'nonexistent', ACTOR)).rejects.toThrow(
      /Unknown framework agreement action/,
    );
  });

  // -- Get --

  it('returns framework agreement with includes', async () => {
    const agreement = fakeAgreement();
    mockPrisma.frameworkAgreement.findUniqueOrThrow.mockResolvedValue(agreement);

    const result = await getFrameworkAgreement('fa1');
    expect(result).toBe(agreement);
    expect(mockPrisma.frameworkAgreement.findUniqueOrThrow).toHaveBeenCalledWith({
      where: { id: 'fa1' },
      include: { items: true, vendor: true },
    });
  });

  // -- List --

  it('applies entity and vendor filters', async () => {
    mockPrisma.frameworkAgreement.findMany.mockResolvedValue([]);
    mockPrisma.frameworkAgreement.count.mockResolvedValue(0);

    await listFrameworkAgreements({ entityId: ENTITY_ID, vendorId: VENDOR_ID, skip: 0, take: 20, sortDirection: 'desc' });
    const call = mockPrisma.frameworkAgreement.findMany.mock.calls[0]![0] as any;
    expect(call.where.entityId).toBe(ENTITY_ID);
    expect(call.where.vendorId).toBe(VENDOR_ID);
  });

  // -- Delete --

  it('deletes draft framework agreement', async () => {
    const existing = fakeAgreement({ status: 'draft' });
    mockPrisma.frameworkAgreement.findUniqueOrThrow.mockResolvedValue(existing);
    mockPrisma.frameworkAgreement.delete.mockResolvedValue(existing);

    await deleteFrameworkAgreement('fa1', ACTOR);
    expect(mockPrisma.frameworkAgreementItem.deleteMany).toHaveBeenCalledWith({ where: { frameworkAgreementId: 'fa1' } });
    expect(mockPrisma.frameworkAgreement.delete).toHaveBeenCalledWith({ where: { id: 'fa1' } });
  });

  it('rejects delete for non-draft framework agreement', async () => {
    const existing = fakeAgreement({ status: 'active' });
    mockPrisma.frameworkAgreement.findUniqueOrThrow.mockResolvedValue(existing);

    await expect(deleteFrameworkAgreement('fa1', ACTOR)).rejects.toThrow(/Cannot delete framework agreement/);
  });

  // -- Utilization --

  it('computes utilization from PO totals', async () => {
    mockPrisma.frameworkAgreement.findUniqueOrThrow.mockResolvedValue({
      id: 'fa1',
      totalCommittedValue: { toString: () => '500000' },
    });
    mockPrisma.purchaseOrder.aggregate.mockResolvedValue({
      _sum: { totalAmount: { toString: () => '150000' } },
    });

    const result = await getUtilization('fa1');
    expect(result.totalUtilized).toBe(150000);
    expect(result.totalCommitted).toBe(500000);
    expect(result.utilizationPercentage).toBe(30);
  });

  it('returns zero utilization when no POs exist', async () => {
    mockPrisma.frameworkAgreement.findUniqueOrThrow.mockResolvedValue({
      id: 'fa1',
      totalCommittedValue: { toString: () => '500000' },
    });
    mockPrisma.purchaseOrder.aggregate.mockResolvedValue({
      _sum: { totalAmount: null },
    });

    const result = await getUtilization('fa1');
    expect(result.totalUtilized).toBe(0);
    expect(result.utilizationPercentage).toBe(0);
  });
});
