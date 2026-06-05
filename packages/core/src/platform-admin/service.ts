/**
 * Platform-admin service — F4 close-out (PIC-98 PR-4b).
 *
 * Platform-admin-only operations on the multi-tenant spine: provisioning new
 * organizations and adjusting per-tenant module entitlement. Gated at the
 * router by `adminProcedure` (system.admin permission); this service-layer
 * code assumes the caller has already passed that gate.
 *
 * Surfaces:
 *   - setOrgModules:  ongoing per-tenant entitlement mutation (writes
 *                     Organization.enabledModules; audit-logged).
 *                     FULL REPLACEMENT — not delta add/remove.
 *   - provisionOrg:   transactional tenant onboarding (Organization +
 *                     root Entity + initial tenant_admin User + UserRole
 *                     in ONE prisma.$transaction; atomic — any failure
 *                     rolls back to zero partial state).
 *
 * Per PD ruling 5ae017b1 (the 7 PR-4b rulings):
 *   Q1 — reuse `adminProcedure` (no new platformAdminProcedure alias)
 *   Q2 — no granular catalog perms (system.admin gate is sufficient)
 *   Q3 — atomic-rollback proven BOTH ways (throw-injection + constraint-violation)
 *   Q4 — entitiesService.createEntity + admin createUser refactored to
 *        accept optional `tx`; behavior-preserving — existing tests stay
 *        GREEN unchanged.
 *   Q5 — adminUser provisioned as brand-new tenant_admin scoped to new org
 *        (NOT platform-admin overlay; password RAW + hashed server-side;
 *        password NEVER logged in audit).
 *   Q6 — setOrgModules FULL REPLACEMENT; validates every key against MODULES
 *        registry; unknown keys rejected.
 *   Q7 — adminProcedure already in PR-4a SAFE_BUILDERS; router-guard
 *        classifies safe-by-builder; no ROUTER_EXEMPTIONS entries.
 */

import bcrypt from 'bcryptjs';
import { prisma } from '@fmksa/db';
import { MODULES, type ModuleKey } from '@fmksa/contracts';
import { auditService } from '../audit/service';
import {
  entitiesService,
  PlatformRootEntityRequiresOrgError,
} from '../entities/service';

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

/** Unknown module key passed to setOrgModules / provisionOrg.enabledModules. */
export class UnknownModuleError extends Error {
  constructor(key: string) {
    super(
      `Unknown module key "${key}". Valid keys: ${Object.keys(MODULES).join(', ')}.`,
    );
    this.name = 'UnknownModuleError';
  }
}

/** A test-only injection hook used by the atomic-rollback proof. Production
 * code paths never trip this — only the rollback-proof test passes a value. */
export type InjectFailurePoint =
  | 'AFTER_ORG_CREATE'
  | 'AFTER_ENTITY_CREATE'
  | 'AFTER_USER_CREATE'
  | undefined;

const SIMULATED_FAILURE = 'SIMULATED_MID_TX_FAILURE';

/** Raised by the throw-injection rollback proof. Never thrown in production. */
export class SimulatedMidTxFailure extends Error {
  constructor(point: Exclude<InjectFailurePoint, undefined>) {
    super(`${SIMULATED_FAILURE}: ${point}`);
    this.name = 'SimulatedMidTxFailure';
  }
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

const BCRYPT_ROUNDS = 12;

const VALID_MODULE_KEYS: ReadonlySet<string> = new Set(Object.keys(MODULES));

function validateModuleKeys(keys: readonly string[]): asserts keys is readonly ModuleKey[] {
  for (const key of keys) {
    if (!VALID_MODULE_KEYS.has(key)) {
      throw new UnknownModuleError(key);
    }
  }
}

export type SetOrgModulesInput = {
  orgId: string;
  enabledModules: readonly string[]; // unvalidated; validated inside
  actorUserId: string;
};

export type ProvisionOrgInput = {
  orgSlug: string;
  orgName: string;
  rootEntityCode: string;
  rootEntityName: string;
  enabledModules?: readonly string[] | undefined;
  adminUser: {
    name: string;
    email: string;
    password: string; // RAW — hashed inside; NEVER logged
  };
  actorUserId: string;
  /** Test-only — injected failure point for atomic-rollback proof. */
  __injectFailureAt?: InjectFailurePoint;
};

export type ProvisionOrgResult = {
  org: { id: string; slug: string; name: string };
  rootEntity: { id: string; code: string; name: string };
  adminUser: { id: string; name: string; email: string }; // NO password
  adminUserRoleId: string;
};

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export const platformAdminService = {
  /**
   * Set the enabledModules for an existing tenant org.
   *
   * FULL REPLACEMENT (not delta). Validates every key against MODULES registry;
   * unknown keys rejected with UnknownModuleError. Audit-logged with
   * before/after.
   *
   * Caller MUST be platform-admin (router enforces via adminProcedure).
   */
  async setOrgModules(input: SetOrgModulesInput) {
    validateModuleKeys(input.enabledModules);

    return prisma.$transaction(async (tx) => {
      const before = await tx.organization.findUnique({
        where: { id: input.orgId },
        select: { id: true, slug: true, enabledModules: true },
      });
      if (!before) {
        throw new Error(`Organization "${input.orgId}" not found.`);
      }

      const updated = await tx.organization.update({
        where: { id: input.orgId },
        data: { enabledModules: input.enabledModules as string[] },
      });

      await auditService.log(
        {
          actorUserId: input.actorUserId,
          actorSource: 'user',
          action: 'platform.org.modules_set',
          resourceType: 'organization',
          resourceId: input.orgId,
          beforeJson: { enabledModules: before.enabledModules },
          afterJson: { enabledModules: updated.enabledModules },
        },
        tx as never,
      );

      return updated;
    });
  },

  /**
   * Provision a new tenant org with a root entity and an initial tenant_admin
   * user, all inside one prisma.$transaction. Atomic — any step failure rolls
   * back to zero partial state (no orphaned Organization, no rootless Entity,
   * no User without a tenant).
   *
   * The adminUser.password is hashed server-side and NEVER appears in audit
   * payload (per PD ruling 5ae017b1 Q5 — password not logged, not raw, not
   * hashed).
   *
   * Caller MUST be platform-admin (router enforces via adminProcedure).
   */
  async provisionOrg(input: ProvisionOrgInput): Promise<ProvisionOrgResult> {
    if (input.enabledModules) validateModuleKeys(input.enabledModules);

    // Hash BEFORE entering the transaction — bcrypt is CPU-bound and slow
    // enough that we don't want it inside a DB transaction.
    const passwordHash = await bcrypt.hash(input.adminUser.password, BCRYPT_ROUNDS);

    // Resolve the tenant_admin role id BEFORE the transaction. Role lookup
    // is read-only and doesn't need to participate in the rollback.
    const tenantAdminRole = await prisma.role.findFirstOrThrow({
      where: { code: 'tenant_admin' },
    });

    return prisma.$transaction(async (tx) => {
      // ---------------------------------------------------------------------
      // Step 1 — Organization
      // ---------------------------------------------------------------------
      const orgData = input.enabledModules
        ? {
            slug: input.orgSlug,
            name: input.orgName,
            enabledModules: input.enabledModules as string[],
          }
        : { slug: input.orgSlug, name: input.orgName };
      const org = await tx.organization.create({ data: orgData });

      if (input.__injectFailureAt === 'AFTER_ORG_CREATE') {
        throw new SimulatedMidTxFailure('AFTER_ORG_CREATE');
      }

      // ---------------------------------------------------------------------
      // Step 2 — root Entity (via refactored entitiesService.createEntity)
      // ---------------------------------------------------------------------
      // entitiesService.createEntity refactored to accept optional `tx` —
      // when provided, all writes (entity + audit log) participate in the
      // outer transaction. Behavior-preserving: omitting `tx` wraps its own
      // transaction as before (existing tests stay GREEN unchanged).
      const rootEntity = await entitiesService.createEntity(
        {
          code: input.rootEntityCode,
          name: input.rootEntityName,
          type: 'parent',
          createdBy: input.actorUserId,
          expectedOrgId: org.id, // non-null → no PlatformRootEntityRequiresOrgError
        },
        tx,
      );

      if (input.__injectFailureAt === 'AFTER_ENTITY_CREATE') {
        throw new SimulatedMidTxFailure('AFTER_ENTITY_CREATE');
      }

      // ---------------------------------------------------------------------
      // Step 3 — initial tenant_admin User
      // ---------------------------------------------------------------------
      const adminUser = await tx.user.create({
        data: {
          orgId: org.id,
          name: input.adminUser.name,
          email: input.adminUser.email,
          passwordHash,
          status: 'active',
        },
      });

      if (input.__injectFailureAt === 'AFTER_USER_CREATE') {
        throw new SimulatedMidTxFailure('AFTER_USER_CREATE');
      }

      // ---------------------------------------------------------------------
      // Step 4 — UserRole binding adminUser → tenant_admin
      // ---------------------------------------------------------------------
      const now = new Date();
      const adminUserRole = await tx.userRole.create({
        data: {
          userId: adminUser.id,
          roleId: tenantAdminRole.id,
          effectiveFrom: now,
          assignedBy: input.actorUserId,
          assignedAt: now,
        },
      });

      // ---------------------------------------------------------------------
      // Step 5 — audit log (password NEVER included)
      // ---------------------------------------------------------------------
      await auditService.log(
        {
          actorUserId: input.actorUserId,
          actorSource: 'user',
          action: 'platform.org.provisioned',
          resourceType: 'organization',
          resourceId: org.id,
          beforeJson: {},
          afterJson: {
            org: { id: org.id, slug: org.slug, name: org.name },
            rootEntity: { id: rootEntity.id, code: rootEntity.code },
            adminUser: {
              id: adminUser.id,
              email: adminUser.email,
              // PD ruling 5ae017b1 Q5: password NEVER logged.
              // Not raw, not hashed, not present in any payload.
            },
            adminUserRoleId: adminUserRole.id,
          },
        },
        tx,
      );

      return {
        org: { id: org.id, slug: org.slug, name: org.name },
        rootEntity: {
          id: rootEntity.id,
          code: rootEntity.code,
          name: rootEntity.name,
        },
        adminUser: {
          id: adminUser.id,
          name: adminUser.name,
          email: adminUser.email,
        },
        adminUserRoleId: adminUserRole.id,
      };
    });
  },
};

// Re-export for router convenience.
export { PlatformRootEntityRequiresOrgError };
