/**
 * Entities service — CRUD for the Entity model (multi-entity hierarchy).
 *
 * Validation rules:
 *  - A 'parent' type entity cannot have a parentEntityId (it IS the root).
 *  - A 'subsidiary' must have a parentEntityId.
 *  - Entity codes must be unique.
 */

import { prisma } from '@fmksa/db';
import { auditService } from '../audit/service';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type CreateEntityInput = {
  code: string;
  name: string;
  type:
    | 'parent'
    | 'subsidiary'
    | 'sister_company'
    | 'branch'
    | 'operating_unit'
    | 'shared_service_entity';
  parentEntityId?: string | null | undefined;
  status?: 'active' | 'inactive' | 'archived' | undefined;
  metadata?: Record<string, unknown> | null | undefined;
  createdBy: string;
};

export type UpdateEntityInput = {
  name?: string | undefined;
  type?:
    | 'parent'
    | 'subsidiary'
    | 'sister_company'
    | 'branch'
    | 'operating_unit'
    | 'shared_service_entity'
    | undefined;
  parentEntityId?: string | null | undefined;
  status?: 'active' | 'inactive' | undefined;
  metadata?: Record<string, unknown> | null | undefined;
};

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export const entitiesService = {
  /**
   * Create a new entity.
   */
  async createEntity(input: CreateEntityInput) {
    // Validate unique code
    const existing = await prisma.entity.findUnique({
      where: { code: input.code },
    });
    if (existing) {
      throw new Error(`Entity code "${input.code}" already exists.`);
    }

    // 'parent' type cannot have a parent
    if (input.type === 'parent' && input.parentEntityId) {
      throw new Error(
        'An entity of type "parent" cannot have a parentEntityId.',
      );
    }

    // 'subsidiary' must have a parent
    if (input.type === 'subsidiary' && !input.parentEntityId) {
      throw new Error(
        'An entity of type "subsidiary" must have a parentEntityId.',
      );
    }

    // Validate parent exists if provided
    if (input.parentEntityId) {
      const parent = await prisma.entity.findUnique({
        where: { id: input.parentEntityId },
      });
      if (!parent) {
        throw new Error(
          `Parent entity "${input.parentEntityId}" not found.`,
        );
      }
    }

    const entity = await prisma.$transaction(async (tx) => {
      const e = await tx.entity.create({
        data: {
          code: input.code,
          name: input.name,
          type: input.type,
          parentEntityId: input.parentEntityId ?? null,
          status: input.status ?? 'active',
          metadataJson: input.metadata
            ? JSON.parse(JSON.stringify(input.metadata))
            : null,
        },
        include: {
          parent: true,
          children: true,
        },
      });

      await auditService.log(
        {
          actorUserId: input.createdBy,
          actorSource: 'user',
          action: 'entity.create',
          resourceType: 'entity',
          resourceId: e.id,
          beforeJson: {},
          afterJson: {
            id: e.id,
            code: e.code,
            name: e.name,
            type: e.type,
            parentEntityId: e.parentEntityId,
            status: e.status,
          },
        },
        tx,
      );

      return e;
    });

    return entity;
  },

  /**
   * Get a single entity with parent and children.
   */
  async getEntity(id: string) {
    const entity = await prisma.entity.findUnique({
      where: { id },
      include: {
        parent: true,
        children: true,
      },
    });

    if (!entity) {
      throw new Error(`Entity "${id}" not found.`);
    }

    return entity;
  },

  /**
   * Update an entity. Writes an audit log with before/after diff.
   */
  async updateEntity(
    id: string,
    data: UpdateEntityInput,
    updatedBy: string,
  ) {
    const entity = await prisma.$transaction(async (tx) => {
      const before = await tx.entity.findUnique({ where: { id } });
      if (!before) {
        throw new Error(`Entity "${id}" not found.`);
      }

      // Validate type rules if changing type or parent
      const newType = data.type ?? before.type;
      const newParent =
        data.parentEntityId !== undefined
          ? data.parentEntityId
          : before.parentEntityId;

      if (newType === 'parent' && newParent) {
        throw new Error(
          'An entity of type "parent" cannot have a parentEntityId.',
        );
      }
      if (newType === 'subsidiary' && !newParent) {
        throw new Error(
          'An entity of type "subsidiary" must have a parentEntityId.',
        );
      }

      // Validate parent exists if changing
      if (data.parentEntityId) {
        const parent = await tx.entity.findUnique({
          where: { id: data.parentEntityId },
        });
        if (!parent) {
          throw new Error(
            `Parent entity "${data.parentEntityId}" not found.`,
          );
        }
      }

      const updated = await tx.entity.update({
        where: { id },
        data: {
          ...(data.name !== undefined && { name: data.name }),
          ...(data.type !== undefined && { type: data.type }),
          ...(data.parentEntityId !== undefined && {
            parentEntityId: data.parentEntityId,
          }),
          ...(data.status !== undefined && { status: data.status }),
          ...(data.metadata !== undefined && {
            metadataJson: data.metadata
              ? JSON.parse(JSON.stringify(data.metadata))
              : null,
          }),
        },
        include: {
          parent: true,
          children: true,
        },
      });

      await auditService.log(
        {
          actorUserId: updatedBy,
          actorSource: 'user',
          action: 'entity.update',
          resourceType: 'entity',
          resourceId: id,
          beforeJson: {
            name: before.name,
            type: before.type,
            parentEntityId: before.parentEntityId,
            status: before.status,
          },
          afterJson: {
            name: updated.name,
            type: updated.type,
            parentEntityId: updated.parentEntityId,
            status: updated.status,
          },
        },
        tx,
      );

      return updated;
    });

    return entity;
  },

  /**
   * Archive an entity. Reason is required.
   */
  async archiveEntity(id: string, reason: string, archivedBy: string) {
    if (!reason || reason.trim().length === 0) {
      throw new Error('Reason is required when archiving an entity.');
    }

    const entity = await prisma.$transaction(async (tx) => {
      const before = await tx.entity.findUnique({ where: { id } });
      if (!before) {
        throw new Error(`Entity "${id}" not found.`);
      }

      if (before.status === 'archived') {
        throw new Error('Entity is already archived.');
      }

      const updated = await tx.entity.update({
        where: { id },
        data: { status: 'archived' },
        include: {
          parent: true,
          children: true,
        },
      });

      await auditService.log(
        {
          actorUserId: archivedBy,
          actorSource: 'user',
          action: 'entity.archive',
          resourceType: 'entity',
          resourceId: id,
          beforeJson: { status: before.status },
          afterJson: { status: 'archived' },
          reason,
        },
        tx,
      );

      return updated;
    });

    return entity;
  },

  /**
   * List all entities, optionally filtering by status.
   */
  async listEntities(opts?: { includeArchived?: boolean }) {
    const where: Record<string, unknown> = {};
    if (!opts?.includeArchived) {
      where.status = { not: 'archived' };
    }

    return prisma.entity.findMany({
      where,
      include: {
        parent: true,
        children: true,
      },
      orderBy: { code: 'asc' },
    });
  },
};
