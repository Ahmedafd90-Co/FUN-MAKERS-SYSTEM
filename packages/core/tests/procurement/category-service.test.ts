import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mock Prisma + audit (hoisted so vi.mock factories can reference them)
// ---------------------------------------------------------------------------

const { mockPrisma, mockAuditLog } = vi.hoisted(() => {
  const mockAuditLog = vi.fn().mockResolvedValue({});
  const mockPrisma = {
    procurementCategory: {
      findUniqueOrThrow: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      count: vi.fn(),
    },
  };
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
  createCategory,
  updateCategory,
  getCategory,
  listCategories,
  getCategoryTree,
  deleteCategory,
} from '../../src/procurement/category/service';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ENTITY_ID = '00000000-0000-0000-0000-000000000001';
const ACTOR = 'test-user';

function fakeCategory(overrides: Record<string, unknown> = {}) {
  return {
    id: 'cat1',
    entityId: ENTITY_ID,
    name: 'Construction Materials',
    code: 'CONSTRUCTION-MATERI',
    level: 'category',
    parentId: null,
    status: 'active',
    createdAt: new Date(),
    updatedAt: new Date(),
    children: [],
    parent: null,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ProcurementCategory Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // -- Create --

  it('creates a top-level category', async () => {
    const created = fakeCategory();
    mockPrisma.procurementCategory.create.mockResolvedValue(created);

    const result = await createCategory({ entityId: ENTITY_ID, name: 'Construction Materials' }, ACTOR);
    expect(result.level).toBe('category');
    expect(mockPrisma.procurementCategory.create).toHaveBeenCalledTimes(1);
    const createCall = mockPrisma.procurementCategory.create.mock.calls[0]![0] as any;
    expect(createCall.data.level).toBe('category');
    expect(createCall.data.parentId).toBeNull();
    expect(mockAuditLog).toHaveBeenCalledTimes(1);
  });

  it('creates a subcategory with parent', async () => {
    const parent = fakeCategory({ id: 'parent1', level: 'category' });
    mockPrisma.procurementCategory.findUniqueOrThrow.mockResolvedValue(parent);
    const created = fakeCategory({ id: 'sub1', level: 'subcategory', parentId: 'parent1' });
    mockPrisma.procurementCategory.create.mockResolvedValue(created);

    const result = await createCategory({ entityId: ENTITY_ID, name: 'Cement', parentId: 'parent1' }, ACTOR);
    expect(result.level).toBe('subcategory');
    expect(result.parentId).toBe('parent1');
  });

  it('creates a spend_type under subcategory', async () => {
    const parent = fakeCategory({ id: 'sub1', level: 'subcategory' });
    mockPrisma.procurementCategory.findUniqueOrThrow.mockResolvedValue(parent);
    const created = fakeCategory({ id: 'st1', level: 'spend_type', parentId: 'sub1' });
    mockPrisma.procurementCategory.create.mockResolvedValue(created);

    const result = await createCategory({ entityId: ENTITY_ID, name: 'Portland Cement', parentId: 'sub1' }, ACTOR);
    expect(result.level).toBe('spend_type');
  });

  it('rejects child under spend_type (invalid parent level)', async () => {
    const parent = fakeCategory({ id: 'st1', level: 'spend_type' });
    mockPrisma.procurementCategory.findUniqueOrThrow.mockResolvedValue(parent);

    await expect(
      createCategory({ entityId: ENTITY_ID, name: 'Invalid Child', parentId: 'st1' }, ACTOR),
    ).rejects.toThrow(/Cannot create a child under level/);
  });

  // -- Update --

  it('updates category successfully', async () => {
    const existing = fakeCategory();
    mockPrisma.procurementCategory.findUniqueOrThrow.mockResolvedValue(existing);
    const updated = fakeCategory({ name: 'Updated Name' });
    mockPrisma.procurementCategory.update.mockResolvedValue(updated);

    const result = await updateCategory({ id: 'cat1', name: 'Updated Name' }, ACTOR);
    expect(result.name).toBe('Updated Name');
    expect(mockAuditLog).toHaveBeenCalledTimes(1);
  });

  // -- Get Category Tree --

  it('returns nested hierarchy', async () => {
    const tree = [
      fakeCategory({
        children: [
          fakeCategory({ id: 'sub1', level: 'subcategory', parentId: 'cat1', children: [
            fakeCategory({ id: 'st1', level: 'spend_type', parentId: 'sub1' }),
          ] }),
        ],
      }),
    ];
    mockPrisma.procurementCategory.findMany.mockResolvedValue(tree);

    const result = await getCategoryTree(ENTITY_ID);
    expect(result).toHaveLength(1);
    expect(result[0]!.children).toHaveLength(1);
    expect((result[0]!.children as any[])[0].children).toHaveLength(1);
    expect(mockPrisma.procurementCategory.findMany).toHaveBeenCalledWith({
      where: { entityId: ENTITY_ID, level: 'category', parentId: null },
      include: { children: { include: { children: true } } },
      orderBy: { name: 'asc' },
    });
  });

  // -- List --

  it('filters by level', async () => {
    mockPrisma.procurementCategory.findMany.mockResolvedValue([]);
    mockPrisma.procurementCategory.count.mockResolvedValue(0);

    await listCategories({ entityId: ENTITY_ID, level: 'subcategory', skip: 0, take: 20, sortDirection: 'desc' });
    const call = mockPrisma.procurementCategory.findMany.mock.calls[0]![0] as any;
    expect(call.where.level).toBe('subcategory');
  });

  it('filters by parentId', async () => {
    mockPrisma.procurementCategory.findMany.mockResolvedValue([]);
    mockPrisma.procurementCategory.count.mockResolvedValue(0);

    await listCategories({ entityId: ENTITY_ID, parentId: 'parent1', skip: 0, take: 20, sortDirection: 'desc' });
    const call = mockPrisma.procurementCategory.findMany.mock.calls[0]![0] as any;
    expect(call.where.parentId).toBe('parent1');
  });

  it('filters by status', async () => {
    mockPrisma.procurementCategory.findMany.mockResolvedValue([]);
    mockPrisma.procurementCategory.count.mockResolvedValue(0);

    await listCategories({ entityId: ENTITY_ID, statusFilter: ['active'], skip: 0, take: 20, sortDirection: 'desc' });
    const call = mockPrisma.procurementCategory.findMany.mock.calls[0]![0] as any;
    expect(call.where.status).toEqual({ in: ['active'] });
  });

  // -- Delete --

  it('deletes category when no children exist', async () => {
    const existing = fakeCategory({ children: [] });
    mockPrisma.procurementCategory.findUniqueOrThrow.mockResolvedValue(existing);
    mockPrisma.procurementCategory.delete.mockResolvedValue(existing);

    await deleteCategory('cat1', ACTOR);
    expect(mockPrisma.procurementCategory.delete).toHaveBeenCalledWith({ where: { id: 'cat1' } });
    expect(mockAuditLog).toHaveBeenCalledTimes(1);
  });

  it('rejects delete when children exist', async () => {
    const existing = fakeCategory({ children: [fakeCategory({ id: 'child1' })] });
    mockPrisma.procurementCategory.findUniqueOrThrow.mockResolvedValue(existing);

    await expect(deleteCategory('cat1', ACTOR)).rejects.toThrow(/Cannot delete category that has children/);
  });
});
