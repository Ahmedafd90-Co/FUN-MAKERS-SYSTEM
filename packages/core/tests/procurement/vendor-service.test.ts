import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mock Prisma + audit (hoisted so vi.mock factories can reference them)
// ---------------------------------------------------------------------------

const { mockPrisma, mockAuditLog, mockPrismaNamespace } = vi.hoisted(() => {
  const mockAuditLog = vi.fn().mockResolvedValue({});
  const mockPrisma: Record<string, any> = {
    vendor: {
      findFirst: vi.fn(),
      findUniqueOrThrow: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      count: vi.fn(),
    },
    project: {
      findUniqueOrThrow: vi.fn(),
    },
    projectVendor: {
      findUniqueOrThrow: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
  };
  // $transaction executes the callback with mockPrisma as the tx client
  mockPrisma.$transaction = vi.fn().mockImplementation((cb: (tx: any) => any) => cb(mockPrisma));
  // Prisma namespace mock for P2002 error handling
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
  createVendor,
  updateVendor,
  transitionVendor,
  getVendor,
  listVendors,
  deleteVendor,
} from '../../src/procurement/vendor/service';

import {
  linkVendorToProject,
  unlinkVendorFromProject,
  listProjectVendors,
  getProjectVendor,
} from '../../src/procurement/vendor/project-vendor-service';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ENTITY_ID = '00000000-0000-0000-0000-000000000001';
const ACTOR = 'test-user';

function fakeVendor(overrides: Record<string, unknown> = {}) {
  return {
    id: 'v1',
    entityId: ENTITY_ID,
    vendorCode: 'V-0001',
    name: 'Acme Corp',
    tradeName: null,
    registrationNumber: null,
    taxId: null,
    contactName: null,
    contactEmail: null,
    contactPhone: null,
    address: null,
    city: null,
    country: null,
    classification: null,
    status: 'draft',
    notes: null,
    createdBy: ACTOR,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Vendor Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // -- Create --

  it('creates vendor in draft status with auto-generated vendorCode', async () => {
    mockPrisma.vendor.findFirst.mockResolvedValue(null); // no existing vendors
    const created = fakeVendor();
    mockPrisma.vendor.create.mockResolvedValue(created);

    const result = await createVendor({ entityId: ENTITY_ID, name: 'Acme Corp' }, ACTOR);
    expect(result.status).toBe('draft');
    expect(result.vendorCode).toBe('V-0001');
    expect(mockPrisma.vendor.create).toHaveBeenCalledTimes(1);
    expect(mockAuditLog).toHaveBeenCalledTimes(1);
  });

  it('auto-generates sequential vendorCode', async () => {
    mockPrisma.vendor.findFirst.mockResolvedValue({ vendorCode: 'V-0003' });
    const created = fakeVendor({ vendorCode: 'V-0004' });
    mockPrisma.vendor.create.mockResolvedValue(created);

    const result = await createVendor({ entityId: ENTITY_ID, name: 'Beta Inc' }, ACTOR);
    expect(result.vendorCode).toBe('V-0004');
  });

  // -- Update --

  it('updates vendor in draft status', async () => {
    const existing = fakeVendor({ status: 'draft' });
    mockPrisma.vendor.findUniqueOrThrow.mockResolvedValue(existing);
    const updated = fakeVendor({ status: 'draft', name: 'Acme Updated' });
    mockPrisma.vendor.update.mockResolvedValue(updated);

    const result = await updateVendor({ id: 'v1', name: 'Acme Updated' }, ACTOR);
    expect(result.name).toBe('Acme Updated');
    expect(mockAuditLog).toHaveBeenCalledTimes(1);
  });

  it('rejects update on non-editable status', async () => {
    const existing = fakeVendor({ status: 'suspended' });
    mockPrisma.vendor.findUniqueOrThrow.mockResolvedValue(existing);

    await expect(updateVendor({ id: 'v1', name: 'Nope' }, ACTOR)).rejects.toThrow(
      /Cannot update vendor/,
    );
  });

  // -- Transition --

  it('transitions draft -> active (activate)', async () => {
    const existing = fakeVendor({ status: 'draft' });
    mockPrisma.vendor.findUniqueOrThrow.mockResolvedValue(existing);
    const updated = fakeVendor({ status: 'active' });
    mockPrisma.vendor.update.mockResolvedValue(updated);

    const result = await transitionVendor('v1', 'activate', ACTOR);
    expect(result.status).toBe('active');
  });

  it('transitions active -> suspended (suspend)', async () => {
    const existing = fakeVendor({ status: 'active' });
    mockPrisma.vendor.findUniqueOrThrow.mockResolvedValue(existing);
    const updated = fakeVendor({ status: 'suspended' });
    mockPrisma.vendor.update.mockResolvedValue(updated);

    const result = await transitionVendor('v1', 'suspend', ACTOR);
    expect(result.status).toBe('suspended');
  });

  it('transitions suspended -> active (activate)', async () => {
    const existing = fakeVendor({ status: 'suspended' });
    mockPrisma.vendor.findUniqueOrThrow.mockResolvedValue(existing);
    const updated = fakeVendor({ status: 'active' });
    mockPrisma.vendor.update.mockResolvedValue(updated);

    const result = await transitionVendor('v1', 'activate', ACTOR);
    expect(result.status).toBe('active');
  });

  it('transitions suspended -> blacklisted (blacklist)', async () => {
    const existing = fakeVendor({ status: 'suspended' });
    mockPrisma.vendor.findUniqueOrThrow.mockResolvedValue(existing);
    const updated = fakeVendor({ status: 'blacklisted' });
    mockPrisma.vendor.update.mockResolvedValue(updated);

    const result = await transitionVendor('v1', 'blacklist', ACTOR);
    expect(result.status).toBe('blacklisted');
  });

  it('rejects invalid transition draft -> suspended', async () => {
    const existing = fakeVendor({ status: 'draft' });
    mockPrisma.vendor.findUniqueOrThrow.mockResolvedValue(existing);

    await expect(transitionVendor('v1', 'suspend', ACTOR)).rejects.toThrow(
      /Invalid vendor transition/,
    );
  });

  it('rejects transition from terminal status', async () => {
    const existing = fakeVendor({ status: 'blacklisted' });
    mockPrisma.vendor.findUniqueOrThrow.mockResolvedValue(existing);

    await expect(transitionVendor('v1', 'activate', ACTOR)).rejects.toThrow(
      /Cannot transition vendor from terminal status/,
    );
  });

  // -- Get --

  it('returns vendor with includes', async () => {
    const vendor = { ...fakeVendor(), projectVendors: [], entity: {} };
    mockPrisma.vendor.findUniqueOrThrow.mockResolvedValue(vendor);

    const result = await getVendor('v1');
    expect(result).toBe(vendor);
    expect(mockPrisma.vendor.findUniqueOrThrow).toHaveBeenCalledWith({
      where: { id: 'v1' },
      include: { projectVendors: true, entity: true },
    });
  });

  // -- List --

  it('applies entity filter', async () => {
    mockPrisma.vendor.findMany.mockResolvedValue([]);
    mockPrisma.vendor.count.mockResolvedValue(0);

    await listVendors({ entityId: ENTITY_ID, skip: 0, take: 20, sortDirection: 'desc' });
    const call = mockPrisma.vendor.findMany.mock.calls[0]![0] as any;
    expect(call.where.entityId).toBe(ENTITY_ID);
  });

  it('applies status filter', async () => {
    mockPrisma.vendor.findMany.mockResolvedValue([]);
    mockPrisma.vendor.count.mockResolvedValue(0);

    await listVendors({ entityId: ENTITY_ID, skip: 0, take: 20, sortDirection: 'desc', statusFilter: ['active'] });
    const call = mockPrisma.vendor.findMany.mock.calls[0]![0] as any;
    expect(call.where.status).toEqual({ in: ['active'] });
  });

  it('applies text search', async () => {
    mockPrisma.vendor.findMany.mockResolvedValue([]);
    mockPrisma.vendor.count.mockResolvedValue(0);

    await listVendors({ entityId: ENTITY_ID, skip: 0, take: 20, sortDirection: 'desc', search: 'Acme' });
    const call = mockPrisma.vendor.findMany.mock.calls[0]![0] as any;
    expect(call.where.OR).toBeDefined();
    expect(call.where.OR).toHaveLength(2);
  });

  // -- Delete --

  it('deletes draft vendor', async () => {
    const existing = fakeVendor({ status: 'draft' });
    mockPrisma.vendor.findUniqueOrThrow.mockResolvedValue(existing);
    mockPrisma.vendor.delete.mockResolvedValue(existing);

    await deleteVendor('v1', ACTOR);
    expect(mockPrisma.vendor.delete).toHaveBeenCalledWith({ where: { id: 'v1' } });
    expect(mockAuditLog).toHaveBeenCalledTimes(1);
  });

  it('rejects delete for non-draft vendor', async () => {
    const existing = fakeVendor({ status: 'active' });
    mockPrisma.vendor.findUniqueOrThrow.mockResolvedValue(existing);

    await expect(deleteVendor('v1', ACTOR)).rejects.toThrow(/Cannot delete vendor/);
  });
});

// ---------------------------------------------------------------------------
// ProjectVendor tests
// ---------------------------------------------------------------------------

describe('ProjectVendor Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('links vendor to project when entity matches', async () => {
    mockPrisma.vendor.findUniqueOrThrow.mockResolvedValue({ entityId: ENTITY_ID });
    mockPrisma.project.findUniqueOrThrow.mockResolvedValue({ entityId: ENTITY_ID });
    const pv = { id: 'pv1', projectId: 'p1', vendorId: 'v1', status: 'active', approvedDate: new Date() };
    mockPrisma.projectVendor.create.mockResolvedValue(pv);

    const result = await linkVendorToProject({ projectId: 'p1', vendorId: 'v1' }, ACTOR);
    expect(result.status).toBe('active');
    expect(mockAuditLog).toHaveBeenCalledTimes(1);
  });

  it('rejects link when entity mismatch', async () => {
    mockPrisma.vendor.findUniqueOrThrow.mockResolvedValue({ entityId: 'other-entity' });
    mockPrisma.project.findUniqueOrThrow.mockResolvedValue({ entityId: ENTITY_ID });

    await expect(linkVendorToProject({ projectId: 'p1', vendorId: 'v1' }, ACTOR)).rejects.toThrow(
      /does not belong to the same entity/,
    );
  });

  it('unlinks vendor from project (soft removal)', async () => {
    const existing = { id: 'pv1', projectId: 'p1', vendorId: 'v1', status: 'active' };
    mockPrisma.projectVendor.findUniqueOrThrow.mockResolvedValue(existing);
    const updated = { ...existing, status: 'inactive' };
    mockPrisma.projectVendor.update.mockResolvedValue(updated);

    const result = await unlinkVendorFromProject('pv1', ACTOR);
    expect(result.status).toBe('inactive');
  });

  it('lists active project vendors', async () => {
    mockPrisma.projectVendor.findMany.mockResolvedValue([]);
    await listProjectVendors('p1');
    expect(mockPrisma.projectVendor.findMany).toHaveBeenCalledWith({
      where: { projectId: 'p1', status: 'active' },
      include: { vendor: true },
      orderBy: { createdAt: 'desc' },
    });
  });

  it('gets project vendor with vendor include', async () => {
    const pv = { id: 'pv1', vendor: {} };
    mockPrisma.projectVendor.findUniqueOrThrow.mockResolvedValue(pv);

    const result = await getProjectVendor('pv1');
    expect(result).toBe(pv);
  });
});
