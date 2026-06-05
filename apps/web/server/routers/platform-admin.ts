/**
 * Platform-admin tRPC router — F4 close-out (PIC-98 PR-4b).
 *
 * Platform-admin-only operations on the multi-tenant spine:
 *   - setOrgModules:  per-tenant module entitlement (full replacement; audit-logged)
 *   - provisionOrg:   transactional onboarding (Org + root Entity + tenant_admin
 *                     User + UserRole — all in ONE prisma.$transaction; atomic)
 *
 * Gating: `adminProcedure` (system.admin permission). Per PD ruling 5ae017b1
 * Q1: reuse existing adminProcedure (no new platformAdminProcedure alias);
 * Q2: no granular catalog perms (system.admin is sufficient). The router name
 * `platformAdmin` conveys intent; adminProcedure conveys enforcement.
 *
 * Router-guard interaction (PR-4a / Q7): adminProcedure is in PR-4a's
 * SAFE_BUILDERS set → router-layer scope-binding guard classifies these
 * handlers as `safe-by-builder` → NO ROUTER_EXEMPTIONS entries required;
 * guard stays 20/20 GREEN.
 */
import { TRPCError } from '@trpc/server';
import { z } from 'zod';

import {
  platformAdminService,
  UnknownModuleError,
  PlatformRootEntityRequiresOrgError,
} from '@fmksa/core';

import { router, adminProcedure } from '../trpc';

// ---------------------------------------------------------------------------
// Input schemas
// ---------------------------------------------------------------------------

// Inline the sellable module enum to keep the zod schema type-narrow.
// Mirrors MODULES registry in @fmksa/contracts; service-layer
// validateModuleKeys is the source of truth — this is a UI-side guard.
const ModuleKeySchema = z.enum([
  'commercial',
  'procurement',
  'budget',
  'documents',
  'drawings',
  'layer1',
]);

const SetOrgModulesInputSchema = z.object({
  orgId: z.string().uuid(),
  enabledModules: z.array(ModuleKeySchema),
});

const ProvisionOrgInputSchema = z.object({
  orgSlug: z.string().min(1).max(100),
  orgName: z.string().min(1).max(200),
  rootEntityCode: z.string().min(1).max(50),
  rootEntityName: z.string().min(1).max(200),
  enabledModules: z.array(ModuleKeySchema).optional(),
  adminUser: z.object({
    name: z.string().min(1).max(200),
    email: z.string().email(),
    password: z.string().min(8),
  }),
});

// ---------------------------------------------------------------------------
// Error mapping
// ---------------------------------------------------------------------------

function mapPlatformAdminError(err: unknown): never {
  if (err instanceof UnknownModuleError) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: err.message,
      cause: err,
    });
  }
  if (err instanceof PlatformRootEntityRequiresOrgError) {
    // Shouldn't fire in provisionOrg (we always pass non-null expectedOrgId)
    // but maps defensively if it ever does.
    throw new TRPCError({
      code: 'PRECONDITION_FAILED',
      message: err.message,
      cause: err,
    });
  }
  throw err;
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

export const platformAdminRouter = router({
  /**
   * Set the enabledModules for an existing tenant org.
   * FULL REPLACEMENT (not delta). Validates every key against MODULES registry.
   */
  setOrgModules: adminProcedure
    .input(SetOrgModulesInputSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        return await platformAdminService.setOrgModules({
          orgId: input.orgId,
          enabledModules: input.enabledModules,
          actorUserId: ctx.user.id,
        });
      } catch (err) {
        mapPlatformAdminError(err);
      }
    }),

  /**
   * Provision a new tenant org with a root entity and an initial tenant_admin
   * user, all inside one prisma.$transaction. Atomic — any failure rolls back.
   * The adminUser.password is hashed server-side and NEVER appears in audit
   * payload.
   */
  provisionOrg: adminProcedure
    .input(ProvisionOrgInputSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        return await platformAdminService.provisionOrg({
          orgSlug: input.orgSlug,
          orgName: input.orgName,
          rootEntityCode: input.rootEntityCode,
          rootEntityName: input.rootEntityName,
          ...(input.enabledModules
            ? { enabledModules: input.enabledModules }
            : {}),
          adminUser: input.adminUser,
          actorUserId: ctx.user.id,
        });
      } catch (err) {
        mapPlatformAdminError(err);
      }
    }),
});
