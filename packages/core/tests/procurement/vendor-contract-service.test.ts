import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mock Prisma + audit + posting (hoisted)
// ---------------------------------------------------------------------------

const { mockPrisma, mockAuditLog, mockPostingPost, mockPrismaNamespace } = vi.hoisted(() => {
  const mockAuditLog = vi.fn().mockResolvedValue({});
  const mockPostingPost = vi.fn().mockResolvedValue({});
  const mockPrisma: Record<string, any> = {
    vendorContract: {
      findFirst: vi.fn(),
      findUniqueOrThrow: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      count: vi.fn(),
    },
  };
  mockPrisma.$transaction = vi.fn().mockImplementation((cb: (tx: any) => any) => cb(mockPrisma));
  class PrismaClientKnownRequestError extends Error {
    code: string;
    constructor(message: string, { code }: { code: string }) {
      super(message);
      this.code = code;
    }
  }
  const mockPrismaNamespace = { PrismaClientKnownRequestError };
  return { mockPrisma, mockAuditLog, mockPostingPost, mockPrismaNamespace };
});

vi.mock('@fmksa/db', () => ({ prisma: mockPrisma, Prisma: mockPrismaNamespace }));
vi.mock('../../src/audit/service', () => ({
  auditService: { log: (...args: unknown[]) => mockAuditLog(...args) },
}));
vi.mock('../../src/posting/service', () => ({
  postingService: { post: (...args: unknown[]) => mockPostingPost(...args) },
}));

// ---------------------------------------------------------------------------
// Import after mocks
// ---------------------------------------------------------------------------

import {
  createVendorContract,
  updateVendorContract,
  transitionVendorContract,
  getVendorContract,
  listVendorContracts,
  deleteVendorContract,
} from '../../src/procurement/vendor-contract/service';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const PROJECT_ID = '00000000-0000-0000-0000-000000000001';
const VENDOR_ID = '00000000-0000-0000-0000-000000000002';
const ENTITY_ID = '00000000-0000-0000-0000-000000000003';
const ACTOR = 'test-user';

function fakeContract(overrides: Record<string, unknown> = {}) {
  return {
    id: 'vc1',
    projectId: PROJECT_ID,
    vendorId: VENDOR_ID,
    contractNumber: 'VC-0001',
    title: 'Test Contract',
    description: null,
    contractType: 'service',
    startDate: new Date('2026-01-01'),
    endDate: new Date('2026-12-31'),
    totalValue: { toString: () => '100000.00' },
    currency: 'SAR',
    terms: null,
    signedDate: null,
    parentContractId: null,
    status: 'draft',
    referenceNumber: null,
    createdBy: ACTOR,
    createdAt: new Date(),
    updatedAt: new Date(),
    project: { id: PROJECT_ID, entityId: ENTITY_ID },
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('VendorContract Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // -- Create --

  it('creates vendor contract in draft status with auto-generated contractNumber', async () => {
    mockPrisma.vendorContract.findFirst.mockResolvedValue(null);
    const created = fakeContract();
    mockPrisma.vendorContract.create.mockResolvedValue(created);

    const result = await createVendorContract({
      entityId: ENTITY_ID,
      vendorId: VENDOR_ID,
      projectId: PROJECT_ID,
      title: 'Test Contract',
      contractType: 'service',
      startDate: '2026-01-01T00:00:00.000Z',
      endDate: '2026-12-31T00:00:00.000Z',
      totalValue: 100000,
      currency: 'SAR',
    }, ACTOR);

    expect(result.status).toBe('draft');
    expect(result.contractNumber).toBe('VC-0001');
    expect(mockPrisma.vendorContract.create).toHaveBeenCalledTimes(1);
    expect(mockAuditLog).toHaveBeenCalledTimes(1);
  });

  it('auto-generates sequential contractNumber', async () => {
    mockPrisma.vendorContract.findFirst.mockResolvedValue({ contractNumber: 'VC-0003' });
    const created = fakeContract({ contractNumber: 'VC-0004' });
    mockPrisma.vendorContract.create.mockResolvedValue(created);

    const result = await createVendorContract({
      entityId: ENTITY_ID,
      vendorId: VENDOR_ID,
      projectId: PROJECT_ID,
      title: 'Another Contract',
      contractType: 'supply',
      startDate: '2026-01-01T00:00:00.000Z',
      endDate: '2026-12-31T00:00:00.000Z',
      totalValue: 50000,
      currency: 'SAR',
    }, ACTOR);

    expect(result.contractNumber).toBe('VC-0004');
  });

  it('retries on P2002 unique violation', async () => {
    const error = new mockPrismaNamespace.PrismaClientKnownRequestError('Unique constraint', { code: 'P2002' });
    mockPrisma.vendorContract.findFirst.mockResolvedValue(null);
    mockPrisma.vendorContract.create.mockRejectedValueOnce(error);
    const created = fakeContract();
    mockPrisma.vendorContract.create.mockResolvedValueOnce(created);

    const result = await createVendorContract({
      entityId: ENTITY_ID,
      vendorId: VENDOR_ID,
      projectId: PROJECT_ID,
      title: 'Test',
      contractType: 'service',
      startDate: '2026-01-01T00:00:00.000Z',
      endDate: '2026-12-31T00:00:00.000Z',
      totalValue: 100000,
      currency: 'SAR',
    }, ACTOR);

    expect(result).toBeDefined();
    expect(mockPrisma.$transaction).toHaveBeenCalledTimes(2);
  });

  // -- Update --

  it('updates vendor contract in draft status', async () => {
    const existing = fakeContract({ status: 'draft' });
    mockPrisma.vendorContract.findUniqueOrThrow.mockResolvedValue(existing);
    const updated = fakeContract({ status: 'draft', title: 'Updated Title' });
    mockPrisma.vendorContract.update.mockResolvedValue(updated);

    const result = await updateVendorContract({ id: 'vc1', title: 'Updated Title' }, ACTOR);
    expect(result.title).toBe('Updated Title');
    expect(mockAuditLog).toHaveBeenCalledTimes(1);
  });

  it('updates vendor contract in returned status', async () => {
    const existing = fakeContract({ status: 'returned' });
    mockPrisma.vendorContract.findUniqueOrThrow.mockResolvedValue(existing);
    const updated = fakeContract({ status: 'returned', title: 'Fixed' });
    mockPrisma.vendorContract.update.mockResolvedValue(updated);

    const result = await updateVendorContract({ id: 'vc1', title: 'Fixed' }, ACTOR);
    expect(result.title).toBe('Fixed');
  });

  it('rejects update on non-editable status', async () => {
    const existing = fakeContract({ status: 'active' });
    mockPrisma.vendorContract.findUniqueOrThrow.mockResolvedValue(existing);

    await expect(updateVendorContract({ id: 'vc1', title: 'Nope' }, ACTOR)).rejects.toThrow(
      /Cannot update vendor contract/,
    );
  });

  // -- Transitions --

  it('transitions draft -> under_review (submit)', async () => {
    const existing = fakeContract({ status: 'draft' });
    mockPrisma.vendorContract.findUniqueOrThrow.mockResolvedValue(existing);
    const updated = fakeContract({ status: 'under_review' });
    mockPrisma.vendorContract.update.mockResolvedValue(updated);

    const result = await transitionVendorContract('vc1', 'submit', ACTOR);
    expect(result.status).toBe('under_review');
  });

  it('transitions under_review -> approved_internal (approve)', async () => {
    const existing = fakeContract({ status: 'under_review' });
    mockPrisma.vendorContract.findUniqueOrThrow.mockResolvedValue(existing);
    const updated = fakeContract({ status: 'approved_internal' });
    mockPrisma.vendorContract.update.mockResolvedValue(updated);

    const result = await transitionVendorContract('vc1', 'approve', ACTOR);
    expect(result.status).toBe('approved_internal');
  });

  it('transitions under_review -> returned (return)', async () => {
    const existing = fakeContract({ status: 'under_review' });
    mockPrisma.vendorContract.findUniqueOrThrow.mockResolvedValue(existing);
    const updated = fakeContract({ status: 'returned' });
    mockPrisma.vendorContract.update.mockResolvedValue(updated);

    const result = await transitionVendorContract('vc1', 'return', ACTOR);
    expect(result.status).toBe('returned');
  });

  it('transitions approved_internal -> signed (sign) and fires VENDOR_CONTRACT_SIGNED', async () => {
    const existing = fakeContract({ status: 'approved_internal' });
    mockPrisma.vendorContract.findUniqueOrThrow.mockResolvedValue(existing);
    const updated = fakeContract({ status: 'signed', signedDate: new Date() });
    mockPrisma.vendorContract.update.mockResolvedValue(updated);

    const result = await transitionVendorContract('vc1', 'sign', ACTOR);
    expect(result.status).toBe('signed');

    // Check signedDate was set
    const updateCall = mockPrisma.vendorContract.update.mock.calls[0]![0] as any;
    expect(updateCall.data.signedDate).toBeInstanceOf(Date);

    // Check posting event was fired
    expect(mockPostingPost).toHaveBeenCalledTimes(1);
    expect(mockPostingPost).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'VENDOR_CONTRACT_SIGNED',
        sourceService: 'procurement',
        sourceRecordType: 'vendor_contract',
      }),
    );
  });

  it('transitions signed -> active (activate)', async () => {
    const existing = fakeContract({ status: 'signed' });
    mockPrisma.vendorContract.findUniqueOrThrow.mockResolvedValue(existing);
    const updated = fakeContract({ status: 'active' });
    mockPrisma.vendorContract.update.mockResolvedValue(updated);

    const result = await transitionVendorContract('vc1', 'activate', ACTOR);
    expect(result.status).toBe('active');
    // No posting event for activate
    expect(mockPostingPost).not.toHaveBeenCalled();
  });

  it('transitions active -> terminated (terminate)', async () => {
    const existing = fakeContract({ status: 'active' });
    mockPrisma.vendorContract.findUniqueOrThrow.mockResolvedValue(existing);
    const updated = fakeContract({ status: 'terminated' });
    mockPrisma.vendorContract.update.mockResolvedValue(updated);

    const result = await transitionVendorContract('vc1', 'terminate', ACTOR);
    expect(result.status).toBe('terminated');
  });

  it('transitions active -> superseded (supersede)', async () => {
    const existing = fakeContract({ status: 'active' });
    mockPrisma.vendorContract.findUniqueOrThrow.mockResolvedValue(existing);
    const updated = fakeContract({ status: 'superseded' });
    mockPrisma.vendorContract.update.mockResolvedValue(updated);

    const result = await transitionVendorContract('vc1', 'supersede', ACTOR);
    expect(result.status).toBe('superseded');
  });

  it('rejects invalid transition draft -> signed', async () => {
    const existing = fakeContract({ status: 'draft' });
    mockPrisma.vendorContract.findUniqueOrThrow.mockResolvedValue(existing);

    await expect(transitionVendorContract('vc1', 'sign', ACTOR)).rejects.toThrow(
      /Invalid vendor contract transition/,
    );
  });

  it('rejects transition from terminal status (rejected)', async () => {
    const existing = fakeContract({ status: 'rejected' });
    mockPrisma.vendorContract.findUniqueOrThrow.mockResolvedValue(existing);

    await expect(transitionVendorContract('vc1', 'submit', ACTOR)).rejects.toThrow(
      /Cannot transition vendor contract from terminal status/,
    );
  });

  it('rejects unknown action', async () => {
    await expect(transitionVendorContract('vc1', 'nonexistent', ACTOR)).rejects.toThrow(
      /Unknown vendor contract action/,
    );
  });

  // -- Amendment chain --

  it('creates contract with parentContractId (amendment chain)', async () => {
    mockPrisma.vendorContract.findFirst.mockResolvedValue({ contractNumber: 'VC-0001' });
    const created = fakeContract({ contractNumber: 'VC-0002', parentContractId: 'vc1' });
    mockPrisma.vendorContract.create.mockResolvedValue(created);

    const result = await createVendorContract({
      entityId: ENTITY_ID,
      vendorId: VENDOR_ID,
      projectId: PROJECT_ID,
      title: 'Amendment',
      contractType: 'service',
      startDate: '2026-01-01T00:00:00.000Z',
      endDate: '2026-12-31T00:00:00.000Z',
      totalValue: 150000,
      currency: 'SAR',
      parentContractId: 'vc1',
    }, ACTOR);

    expect(result.parentContractId).toBe('vc1');
  });

  // -- Get --

  it('returns vendor contract with includes', async () => {
    const contract = { ...fakeContract(), vendor: {}, parentContract: null, childContracts: [] };
    mockPrisma.vendorContract.findUniqueOrThrow.mockResolvedValue(contract);

    const result = await getVendorContract('vc1');
    expect(result).toBe(contract);
    expect(mockPrisma.vendorContract.findUniqueOrThrow).toHaveBeenCalledWith({
      where: { id: 'vc1' },
      include: { project: true, vendor: true, parentContract: true, childContracts: true },
    });
  });

  // -- List --

  it('applies project and vendor filters', async () => {
    mockPrisma.vendorContract.findMany.mockResolvedValue([]);
    mockPrisma.vendorContract.count.mockResolvedValue(0);

    await listVendorContracts({ projectId: PROJECT_ID, vendorId: VENDOR_ID, skip: 0, take: 20, sortDirection: 'desc' });
    const call = mockPrisma.vendorContract.findMany.mock.calls[0]![0] as any;
    expect(call.where.projectId).toBe(PROJECT_ID);
    expect(call.where.vendorId).toBe(VENDOR_ID);
  });

  it('applies status filter', async () => {
    mockPrisma.vendorContract.findMany.mockResolvedValue([]);
    mockPrisma.vendorContract.count.mockResolvedValue(0);

    await listVendorContracts({ projectId: PROJECT_ID, skip: 0, take: 20, sortDirection: 'desc', statusFilter: ['active'] });
    const call = mockPrisma.vendorContract.findMany.mock.calls[0]![0] as any;
    expect(call.where.status).toEqual({ in: ['active'] });
  });

  // -- Delete --

  it('deletes draft vendor contract', async () => {
    const existing = fakeContract({ status: 'draft' });
    mockPrisma.vendorContract.findUniqueOrThrow.mockResolvedValue(existing);
    mockPrisma.vendorContract.delete.mockResolvedValue(existing);

    await deleteVendorContract('vc1', ACTOR);
    expect(mockPrisma.vendorContract.delete).toHaveBeenCalledWith({ where: { id: 'vc1' } });
    expect(mockAuditLog).toHaveBeenCalledTimes(1);
  });

  it('rejects delete for non-draft vendor contract', async () => {
    const existing = fakeContract({ status: 'active' });
    mockPrisma.vendorContract.findUniqueOrThrow.mockResolvedValue(existing);

    await expect(deleteVendorContract('vc1', ACTOR)).rejects.toThrow(/Cannot delete vendor contract/);
  });
});
