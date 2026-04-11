/**
 * ItemCatalog service — entity-scoped CRUD + text search.
 *
 * Phase 4, Task 4.2 — Module 3 Procurement Engine.
 */
import { prisma } from '@fmksa/db';
import type { CreateCatalogItemInput, UpdateCatalogItemInput, EntityListFilterInput } from '@fmksa/contracts';
import { auditService } from '../../audit/service';
import { nextItemCode } from './validation';

// ---------------------------------------------------------------------------
// Internal: generate sequential itemCode for entity
// ---------------------------------------------------------------------------

async function generateItemCode(entityId: string): Promise<string> {
  const last = await prisma.itemCatalog.findFirst({
    where: { entityId },
    orderBy: { itemCode: 'desc' },
    select: { itemCode: true },
  });
  return nextItemCode(last?.itemCode ?? null);
}

// ---------------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------------

export async function createCatalogItem(input: CreateCatalogItemInput, actorUserId: string) {
  const itemCode = await generateItemCode(input.entityId);

  const item = await prisma.itemCatalog.create({
    data: {
      entityId: input.entityId,
      itemCode,
      description: input.description ?? input.name,
      unit: input.unit,
      categoryId: input.categoryId ?? null,
      status: 'active',
    },
  });

  await auditService.log({
    actorUserId,
    actorSource: 'user',
    action: 'item_catalog.create',
    resourceType: 'item_catalog',
    resourceId: item.id,
    beforeJson: null,
    afterJson: item as any,
  });

  return item;
}

// ---------------------------------------------------------------------------
// Update
// ---------------------------------------------------------------------------

export async function updateCatalogItem(input: UpdateCatalogItemInput, actorUserId: string) {
  const existing = await prisma.itemCatalog.findUniqueOrThrow({
    where: { id: input.id },
  });

  const { id, ...updateFields } = input;
  const data: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(updateFields)) {
    if (value === undefined) continue;
    data[key] = value;
  }

  const updated = await prisma.itemCatalog.update({
    where: { id },
    data,
  });

  await auditService.log({
    actorUserId,
    actorSource: 'user',
    action: 'item_catalog.update',
    resourceType: 'item_catalog',
    resourceId: id,
    beforeJson: existing as any,
    afterJson: updated as any,
  });

  return updated;
}

// ---------------------------------------------------------------------------
// Get
// ---------------------------------------------------------------------------

export async function getCatalogItem(id: string) {
  return prisma.itemCatalog.findUniqueOrThrow({
    where: { id },
  });
}

// ---------------------------------------------------------------------------
// List (paginated + filters)
// ---------------------------------------------------------------------------

export async function listCatalogItems(input: EntityListFilterInput & { search?: string | undefined }) {
  const where: Record<string, unknown> = { entityId: input.entityId };

  if (input.statusFilter && input.statusFilter.length > 0) {
    where.status = { in: input.statusFilter };
  }

  if (input.categoryId) {
    where.categoryId = input.categoryId;
  }

  if (input.search) {
    where.OR = [
      { description: { contains: input.search, mode: 'insensitive' } },
      { itemCode: { contains: input.search, mode: 'insensitive' } },
    ];
  }

  const orderBy: Record<string, string> = {};
  orderBy[input.sortField ?? 'createdAt'] = input.sortDirection ?? 'desc';

  const [items, total] = await Promise.all([
    prisma.itemCatalog.findMany({
      where,
      orderBy,
      skip: input.skip ?? 0,
      take: input.take ?? 20,
    }),
    prisma.itemCatalog.count({ where }),
  ]);

  return { items, total };
}

// ---------------------------------------------------------------------------
// Search (autocomplete-style text search)
// ---------------------------------------------------------------------------

export async function searchCatalogItems(entityId: string, query: string) {
  return prisma.itemCatalog.findMany({
    where: {
      entityId,
      status: 'active',
      OR: [
        { description: { contains: query, mode: 'insensitive' } },
        { itemCode: { contains: query, mode: 'insensitive' } },
      ],
    },
    take: 20,
    orderBy: { description: 'asc' },
  });
}

// ---------------------------------------------------------------------------
// Delete (soft delete — archive)
// ---------------------------------------------------------------------------

export async function deleteCatalogItem(id: string, actorUserId: string) {
  const existing = await prisma.itemCatalog.findUniqueOrThrow({
    where: { id },
  });

  if (existing.status !== 'active') {
    throw new Error(`Cannot archive catalog item in status '${existing.status}'. Only active items can be archived.`);
  }

  const updated = await prisma.itemCatalog.update({
    where: { id },
    data: { status: 'archived' },
  });

  await auditService.log({
    actorUserId,
    actorSource: 'user',
    action: 'item_catalog.delete',
    resourceType: 'item_catalog',
    resourceId: id,
    beforeJson: existing as any,
    afterJson: updated as any,
  });

  return updated;
}
