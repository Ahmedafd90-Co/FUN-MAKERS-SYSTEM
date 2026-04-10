/**
 * Entity hierarchy helpers — ancestors, descendants, siblings.
 *
 * These operate on the self-referencing Entity tree
 * (parentEntityId → Entity.id).
 */

import { prisma } from '@fmksa/db';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type EntityNode = {
  id: string;
  code: string;
  name: string;
  type: string;
  parentEntityId: string | null;
  status: string;
};

type EntityWithDepth = EntityNode & { depth: number };

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Get ancestors of an entity, ordered from root to immediate parent.
 */
export async function getAncestors(entityId: string): Promise<EntityNode[]> {
  const ancestors: EntityNode[] = [];

  let currentId: string | null = entityId;

  // Walk up the tree (with cycle guard)
  const visited = new Set<string>();

  while (currentId) {
    if (visited.has(currentId)) break; // cycle guard
    visited.add(currentId);

    const found: EntityNode | null = await prisma.entity.findUnique({
      where: { id: currentId },
      select: {
        id: true,
        code: true,
        name: true,
        type: true,
        parentEntityId: true,
        status: true,
      },
    });

    if (!found) break;

    // Don't include the starting entity itself
    if (found.id !== entityId) {
      ancestors.unshift(found); // prepend so root is first
    }

    currentId = found.parentEntityId;
  }

  return ancestors;
}

/**
 * Get all descendants of an entity as a flat list with depth.
 */
export async function getDescendants(
  entityId: string,
): Promise<EntityWithDepth[]> {
  const result: EntityWithDepth[] = [];

  async function walk(parentId: string, depth: number) {
    const children = await prisma.entity.findMany({
      where: { parentEntityId: parentId },
      select: {
        id: true,
        code: true,
        name: true,
        type: true,
        parentEntityId: true,
        status: true,
      },
      orderBy: { code: 'asc' },
    });

    for (const child of children) {
      result.push({ ...child, depth });
      await walk(child.id, depth + 1);
    }
  }

  await walk(entityId, 1);
  return result;
}

/**
 * Get siblings of an entity (entities with the same parent).
 * Excludes the entity itself from the result.
 */
export async function getSiblings(entityId: string): Promise<EntityNode[]> {
  const entity = await prisma.entity.findUnique({
    where: { id: entityId },
    select: { parentEntityId: true },
  });

  if (!entity) {
    throw new Error(`Entity "${entityId}" not found.`);
  }

  return prisma.entity.findMany({
    where: {
      parentEntityId: entity.parentEntityId,
      id: { not: entityId },
    },
    select: {
      id: true,
      code: true,
      name: true,
      type: true,
      parentEntityId: true,
      status: true,
    },
    orderBy: { code: 'asc' },
  });
}
