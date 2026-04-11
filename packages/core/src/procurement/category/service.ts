/**
 * ProcurementCategory service — entity-scoped CRUD + 3-level hierarchy.
 *
 * Phase 4, Task 4.1 — Module 3 Procurement Engine.
 */
import { prisma } from '@fmksa/db';
import type { CreateCategoryInput, UpdateCategoryInput, EntityListFilterInput } from '@fmksa/contracts';
import { auditService } from '../../audit/service';
import { deriveChildLevel, defaultTopLevel } from './validation';
import { assertEntityScope } from '../../scope-binding';

// ---------------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------------

export async function createCategory(input: CreateCategoryInput, actorUserId: string) {
  let level: 'category' | 'subcategory' | 'spend_type' = defaultTopLevel();

  if (input.parentId) {
    const parent = await prisma.procurementCategory.findUniqueOrThrow({
      where: { id: input.parentId },
    });
    if (parent.entityId !== input.entityId) {
      throw new Error('Parent category must belong to the same entity.');
    }
    level = deriveChildLevel(parent.level);
  }

  const category = await prisma.procurementCategory.create({
    data: {
      entityId: input.entityId,
      name: input.name,
      code: input.code ?? input.name.toUpperCase().replace(/\s+/g, '-').slice(0, 20),
      level,
      parentId: input.parentId ?? null,
      status: 'active',
    },
  });

  await auditService.log({
    actorUserId,
    actorSource: 'user',
    action: 'procurement_category.create',
    resourceType: 'procurement_category',
    resourceId: category.id,
    beforeJson: null,
    afterJson: category as any,
  });

  return category;
}

// ---------------------------------------------------------------------------
// Update
// ---------------------------------------------------------------------------

export async function updateCategory(input: UpdateCategoryInput, actorUserId: string, entityId?: string) {
  const existing = await prisma.procurementCategory.findUniqueOrThrow({
    where: { id: input.id },
  });
  if (entityId) assertEntityScope(existing, entityId, 'ProcurementCategory', input.id);

  const { id, ...updateFields } = input;
  const data: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(updateFields)) {
    if (value === undefined) continue;
    data[key] = value;
  }

  // Re-derive level when parentId changes to maintain 3-level hierarchy
  if ('parentId' in updateFields) {
    if (updateFields.parentId === null) {
      // Moving to top-level
      data.level = defaultTopLevel();
    } else if (updateFields.parentId) {
      const newParent = await prisma.procurementCategory.findUniqueOrThrow({
        where: { id: updateFields.parentId },
      });
      if (newParent.entityId !== existing.entityId) {
        throw new Error('Parent category must belong to the same entity.');
      }
      data.level = deriveChildLevel(newParent.level);
    }
  }

  const updated = await prisma.procurementCategory.update({
    where: { id },
    data,
  });

  await auditService.log({
    actorUserId,
    actorSource: 'user',
    action: 'procurement_category.update',
    resourceType: 'procurement_category',
    resourceId: id,
    beforeJson: existing as any,
    afterJson: updated as any,
  });

  return updated;
}

// ---------------------------------------------------------------------------
// Get
// ---------------------------------------------------------------------------

export async function getCategory(id: string, entityId?: string) {
  const record = await prisma.procurementCategory.findUniqueOrThrow({
    where: { id },
    include: { children: true, parent: true },
  });
  if (entityId) assertEntityScope(record, entityId, 'ProcurementCategory', id);
  return record;
}

// ---------------------------------------------------------------------------
// List (paginated + filters)
// ---------------------------------------------------------------------------

export async function listCategories(input: EntityListFilterInput & { level?: string | undefined; parentId?: string | null | undefined }) {
  const where: Record<string, unknown> = { entityId: input.entityId };

  if (input.statusFilter && input.statusFilter.length > 0) {
    where.status = { in: input.statusFilter };
  }

  if (input.level) {
    where.level = input.level;
  }

  if (input.parentId !== undefined) {
    where.parentId = input.parentId;
  }

  if (input.categoryId) {
    where.parentId = input.categoryId;
  }

  const orderBy: Record<string, string> = {};
  orderBy[input.sortField ?? 'createdAt'] = input.sortDirection ?? 'desc';

  const [items, total] = await Promise.all([
    prisma.procurementCategory.findMany({
      where,
      orderBy,
      skip: input.skip ?? 0,
      take: input.take ?? 20,
      include: { parent: true, children: true },
    }),
    prisma.procurementCategory.count({ where }),
  ]);

  return { items, total };
}

// ---------------------------------------------------------------------------
// Get Category Tree (full hierarchy for an entity)
// ---------------------------------------------------------------------------

export async function getCategoryTree(entityId: string) {
  return prisma.procurementCategory.findMany({
    where: { entityId, level: 'category', parentId: null },
    include: {
      children: {
        include: {
          children: true,
        },
      },
    },
    orderBy: { name: 'asc' },
  });
}

// ---------------------------------------------------------------------------
// Delete (only if no children exist — hard delete)
// ---------------------------------------------------------------------------

export async function deleteCategory(id: string, actorUserId: string, entityId?: string) {
  const existing = await prisma.procurementCategory.findUniqueOrThrow({
    where: { id },
    include: { children: true },
  });
  if (entityId) assertEntityScope(existing, entityId, 'ProcurementCategory', id);

  if (existing.children.length > 0) {
    throw new Error('Cannot delete category that has children. Remove child categories first.');
  }

  await prisma.procurementCategory.delete({ where: { id } });

  await auditService.log({
    actorUserId,
    actorSource: 'user',
    action: 'procurement_category.delete',
    resourceType: 'procurement_category',
    resourceId: id,
    beforeJson: existing as any,
    afterJson: null,
  });
}
