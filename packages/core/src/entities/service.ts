/**
 * Entities service — CRUD for the Entity model (multi-entity hierarchy).
 *
 * Validation rules:
 *  - A 'parent' type entity cannot have a parentEntityId (it IS the root).
 *  - A 'subsidiary' must have a parentEntityId.
 *  - Entity codes must be unique PER ORG (PIC-96 F2 @@unique([orgId, code])).
 *
 * PIC-98 PR-3b (F4) — every public method takes `expectedOrgId: string | null`:
 *   - string (non-null): caller is tenant_admin or other non-platform role.
 *     Scope all reads to this org; NOT-FOUND-shaped denial on cross-org by-id.
 *   - null: caller is platform_admin (isPlatformAdmin(ctx) = true). Cross-org
 *     bypass — F3 D3 survives by construction.
 *
 * Root-entity-org-derivation (carry-forward 00139619, PD-ruled 705f59a9):
 *   - Subsidiaries derive orgId from their parent; parent.orgId must match
 *     caller scope or NOT_FOUND-shaped (no existence disclosure).
 *   - Root entities (type='parent', no parentEntityId) use expectedOrgId.
 *   - Platform_admin with null expectedOrgId attempting to create a root → CLEAN ERROR
 *     deferring to PR-4's master-provisioning procedure (NOT a singleton fallthrough,
 *     NOT a crash — explicit "use platform-admin tool" boundary).
 */

import { prisma } from '@fmksa/db';
import { auditService } from '../audit/service';
import { assertOrgScope, ScopeMismatchError } from '../scope-binding';

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

/**
 * Error thrown when platform_admin attempts to create a root entity without
 * specifying an orgId. This is the explicit boundary for PR-4's master-
 * provisioning procedure (createOrganization + onboard root entity). Per PD
 * ruling 705f59a9: NOT a crash, NOT a singleton fallthrough.
 */
export class PlatformRootEntityRequiresOrgError extends Error {
  constructor() {
    super(
      'Platform-admin cannot create a root entity without specifying an orgId. ' +
        'Use the master-provisioning procedure (PR-4) to onboard a new tenant org.',
    );
    this.name = 'PlatformRootEntityRequiresOrgError';
  }
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export const entitiesService = {
  /**
   * Create a new entity.
   *
   * PR-3b: requires `expectedOrgId` to derive/validate the entity's orgId.
   *   - subsidiary: parent.orgId becomes new orgId; parent must be in caller's
   *     scope (or platform-admin bypass).
   *   - root: expectedOrgId becomes new orgId; platform_admin with null
   *     expectedOrgId throws PlatformRootEntityRequiresOrgError.
   */
  async createEntity(
    input: CreateEntityInput & { expectedOrgId: string | null },
  ) {
    const { expectedOrgId, ...createData } = input;

    // 1. Type/parent shape validation (unchanged)
    if (createData.type === 'parent' && createData.parentEntityId) {
      throw new Error(
        'An entity of type "parent" cannot have a parentEntityId.',
      );
    }
    if (createData.type === 'subsidiary' && !createData.parentEntityId) {
      throw new Error(
        'An entity of type "subsidiary" must have a parentEntityId.',
      );
    }

    // 2. Resolve orgId — root vs subsidiary
    let orgId: string;
    if (createData.parentEntityId) {
      // SUBSIDIARY path: derive from parent + assert caller can reach parent
      const parent = await prisma.entity.findUnique({
        where: { id: createData.parentEntityId },
        select: { id: true, orgId: true },
      });
      if (!parent) {
        // NOT-FOUND-shaped (cross-org parent indistinguishable from missing)
        throw new ScopeMismatchError(
          'Entity',
          createData.parentEntityId,
          'org',
        );
      }
      if (expectedOrgId !== null && parent.orgId !== expectedOrgId) {
        // Cross-org parent: NOT_FOUND-shaped denial (mirror F3 idiom)
        throw new ScopeMismatchError(
          'Entity',
          createData.parentEntityId,
          'org',
        );
      }
      orgId = parent.orgId;
    } else {
      // ROOT path: type='parent' with no parentEntityId
      if (expectedOrgId === null) {
        // Platform_admin attempting to create a root without specifying org →
        // explicit boundary error. Deferred to PR-4's master-provisioning.
        throw new PlatformRootEntityRequiresOrgError();
      }
      orgId = expectedOrgId;
    }

    // 3. PER-ORG uniqueness pre-check (was global; PR-3b scopes to derived org)
    const existing = await prisma.entity.findFirst({
      where: { orgId, code: createData.code },
    });
    if (existing) {
      throw new Error(`Entity code "${createData.code}" already exists.`);
    }

    // 4. Create + audit
    const entity = await prisma.$transaction(async (tx) => {
      const e = await tx.entity.create({
        data: {
          orgId,
          code: createData.code,
          name: createData.name,
          type: createData.type,
          parentEntityId: createData.parentEntityId ?? null,
          status: createData.status ?? 'active',
          metadataJson: createData.metadata
            ? JSON.parse(JSON.stringify(createData.metadata))
            : null,
        },
        include: {
          parent: true,
          children: true,
        },
      });

      await auditService.log(
        {
          actorUserId: createData.createdBy,
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
            orgId: e.orgId,
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
   *
   * PR-3b: expectedOrgId for cross-org NOT_FOUND-shaped denial.
   */
  async getEntity(id: string, expectedOrgId: string | null) {
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

    // PR-3b cross-org NOT-FOUND-shaped denial
    if (expectedOrgId !== null) {
      assertOrgScope(entity, expectedOrgId, 'Entity', id);
    }

    return entity;
  },

  /**
   * Update an entity. Writes an audit log with before/after diff.
   *
   * PR-3b: expectedOrgId; cross-org by-id update → NOT_FOUND-shaped.
   */
  async updateEntity(
    id: string,
    data: UpdateEntityInput,
    updatedBy: string,
    expectedOrgId: string | null,
  ) {
    const entity = await prisma.$transaction(async (tx) => {
      const before = await tx.entity.findUnique({ where: { id } });
      if (!before) {
        throw new Error(`Entity "${id}" not found.`);
      }

      // PR-3b cross-org NOT-FOUND-shaped denial
      if (expectedOrgId !== null) {
        assertOrgScope(before, expectedOrgId, 'Entity', id);
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

      // Validate parent exists if changing — and parent must be in caller's org
      if (data.parentEntityId) {
        const parent = await tx.entity.findUnique({
          where: { id: data.parentEntityId },
          select: { id: true, orgId: true },
        });
        if (!parent) {
          throw new ScopeMismatchError('Entity', data.parentEntityId, 'org');
        }
        if (expectedOrgId !== null && parent.orgId !== expectedOrgId) {
          throw new ScopeMismatchError('Entity', data.parentEntityId, 'org');
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
   *
   * PR-3b: expectedOrgId; cross-org by-id archive → NOT_FOUND-shaped.
   */
  async archiveEntity(
    id: string,
    reason: string,
    archivedBy: string,
    expectedOrgId: string | null,
  ) {
    if (!reason || reason.trim().length === 0) {
      throw new Error('Reason is required when archiving an entity.');
    }

    const entity = await prisma.$transaction(async (tx) => {
      const before = await tx.entity.findUnique({ where: { id } });
      if (!before) {
        throw new Error(`Entity "${id}" not found.`);
      }

      // PR-3b cross-org NOT-FOUND-shaped denial
      if (expectedOrgId !== null) {
        assertOrgScope(before, expectedOrgId, 'Entity', id);
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
   * List entities, optionally filtering by status.
   *
   * PR-3b: expectedOrgId scopes the list. Non-null → where.orgId = expectedOrgId;
   * null → cross-org (platform-admin).
   */
  async listEntities(opts?: {
    includeArchived?: boolean;
    expectedOrgId?: string | null;
  }) {
    const where: Record<string, unknown> = {};
    if (!opts?.includeArchived) {
      where.status = { not: 'archived' };
    }
    // PR-3b: scope to caller's org unless platform-admin bypass
    if (opts?.expectedOrgId !== null && opts?.expectedOrgId !== undefined) {
      where.orgId = opts.expectedOrgId;
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
