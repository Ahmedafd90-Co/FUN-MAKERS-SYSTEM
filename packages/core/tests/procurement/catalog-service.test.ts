import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mock Prisma + audit (hoisted so vi.mock factories can reference them)
// ---------------------------------------------------------------------------

const { mockPrisma, mockAuditLog } = vi.hoisted(() => {
  const mockAuditLog = vi.fn().mockResolvedValue({});
  const mockPrisma = {
    itemCatalog: {
      findFirst: vi.fn(),
      findUniqueOrThrow: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
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
  createCatalogItem,
  updateCatalogItem,
  getCatalogItem,
  listCatalogItems,
  searchCatalogItems,
  deleteCatalogItem,
} from '../../src/procurement/catalog/service';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ENTITY_ID = '00000000-0000-0000-0000-000000000001';
const ACTOR = 'test-user';

function fakeItem(overrides: Record<string, unknown> = {}) {
  return {
    id: 'item1',
    entityId: ENTITY_ID,
    itemCode: 'IC-0001',
    description: 'Concrete Mix',
    unit: 'bag',
    categoryId: null,
    status: 'active',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ItemCatalog Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // -- Create --

  it('creates catalog item with auto-generated itemCode', async () => {
    mockPrisma.itemCatalog.findFirst.mockResolvedValue(null); // no existing items
    const created = fakeItem();
    mockPrisma.itemCatalog.create.mockResolvedValue(created);

    const result = await createCatalogItem(
      { entityId: ENTITY_ID, name: 'Concrete Mix', unit: 'bag' },
      ACTOR,
    );
    expect(result.itemCode).toBe('IC-0001');
    expect(result.status).toBe('active');
    expect(mockAuditLog).toHaveBeenCalledTimes(1);
  });

  it('auto-generates sequential itemCode', async () => {
    mockPrisma.itemCatalog.findFirst.mockResolvedValue({ itemCode: 'IC-0005' });
    const created = fakeItem({ itemCode: 'IC-0006' });
    mockPrisma.itemCatalog.create.mockResolvedValue(created);

    const result = await createCatalogItem(
      { entityId: ENTITY_ID, name: 'Steel Bar', unit: 'ton' },
      ACTOR,
    );
    expect(result.itemCode).toBe('IC-0006');
  });

  // -- Update --

  it('updates catalog item successfully', async () => {
    const existing = fakeItem();
    mockPrisma.itemCatalog.findUniqueOrThrow.mockResolvedValue(existing);
    const updated = fakeItem({ description: 'Updated Mix' });
    mockPrisma.itemCatalog.update.mockResolvedValue(updated);

    const result = await updateCatalogItem({ id: 'item1', description: 'Updated Mix' }, ACTOR);
    expect(result.description).toBe('Updated Mix');
    expect(mockAuditLog).toHaveBeenCalledTimes(1);
  });

  // -- Get --

  it('gets catalog item', async () => {
    const item = fakeItem();
    mockPrisma.itemCatalog.findUniqueOrThrow.mockResolvedValue(item);

    const result = await getCatalogItem('item1');
    expect(result).toBe(item);
  });

  // -- Search --

  it('text search returns matches', async () => {
    const items = [fakeItem(), fakeItem({ id: 'item2', description: 'Concrete Block' })];
    mockPrisma.itemCatalog.findMany.mockResolvedValue(items);

    const result = await searchCatalogItems(ENTITY_ID, 'Concrete');
    expect(result).toHaveLength(2);
    expect(mockPrisma.itemCatalog.findMany).toHaveBeenCalledWith({
      where: {
        entityId: ENTITY_ID,
        status: 'active',
        OR: [
          { description: { contains: 'Concrete', mode: 'insensitive' } },
          { itemCode: { contains: 'Concrete', mode: 'insensitive' } },
        ],
      },
      take: 20,
      orderBy: { description: 'asc' },
    });
  });

  // -- List --

  it('applies category filter', async () => {
    mockPrisma.itemCatalog.findMany.mockResolvedValue([]);
    mockPrisma.itemCatalog.count.mockResolvedValue(0);

    await listCatalogItems({
      entityId: ENTITY_ID,
      categoryId: 'cat1',
      skip: 0,
      take: 20,
      sortDirection: 'desc',
    });
    const call = mockPrisma.itemCatalog.findMany.mock.calls[0]![0] as any;
    expect(call.where.categoryId).toBe('cat1');
  });

  it('applies text search filter in list', async () => {
    mockPrisma.itemCatalog.findMany.mockResolvedValue([]);
    mockPrisma.itemCatalog.count.mockResolvedValue(0);

    await listCatalogItems({
      entityId: ENTITY_ID,
      search: 'steel',
      skip: 0,
      take: 20,
      sortDirection: 'desc',
    });
    const call = mockPrisma.itemCatalog.findMany.mock.calls[0]![0] as any;
    expect(call.where.OR).toBeDefined();
  });

  // -- Delete (soft) --

  it('archives active catalog item (soft delete)', async () => {
    const existing = fakeItem({ status: 'active' });
    mockPrisma.itemCatalog.findUniqueOrThrow.mockResolvedValue(existing);
    const archived = fakeItem({ status: 'archived' });
    mockPrisma.itemCatalog.update.mockResolvedValue(archived);

    const result = await deleteCatalogItem('item1', ACTOR);
    expect(result.status).toBe('archived');
    expect(mockPrisma.itemCatalog.update).toHaveBeenCalledWith({
      where: { id: 'item1' },
      data: { status: 'archived' },
    });
    expect(mockAuditLog).toHaveBeenCalledTimes(1);
  });

  it('rejects archive on non-active item', async () => {
    const existing = fakeItem({ status: 'archived' });
    mockPrisma.itemCatalog.findUniqueOrThrow.mockResolvedValue(existing);

    await expect(deleteCatalogItem('item1', ACTOR)).rejects.toThrow(
      /Cannot archive catalog item/,
    );
  });
});
