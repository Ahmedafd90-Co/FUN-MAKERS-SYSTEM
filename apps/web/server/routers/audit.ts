/**
 * Audit & Override tRPC router — Phase 1.9
 *
 * Procedures (PIC-98 PR-3c — F4 tenant-admin reachability scoped):
 *   audit.list           — paginated, filterable audit logs
 *   audit.get            — single audit entry with full JSON
 *   audit.overrides      — paginated, filterable override logs
 *   audit.overrideDetail — single override entry with linked audit log
 *
 * PIC-98 PR-3c (F4):
 *   - All 4 procedures converted from adminProcedure → protectedProcedure
 *     + hasPerm('audit.view') (mirrors PR-3a/3b pattern).
 *   - tenant_admin reaches own-org audit + overrides via expectedOrgId =
 *     ctx.orgId; platform_admin still crosses orgs (expectedOrgId = null).
 *   - Service-layer org-scope via direct AuditLog.orgId (F2 PIC-96) +
 *     OverrideLog.orgId (PR-2 denorm). NO JOIN — guard-visible.
 *   - ScopeMismatchError → TRPC NOT_FOUND (F3 idiom; no existence disclosure).
 *   - F4_DEFERRED exemptions for getAuditLog + getOverrideLog LIFTED in the
 *     same PR; AST scope-binding-guard stays GREEN by virtue of the new
 *     assertOrgScope idiom present at the service layer.
 *
 * EXPLICITLY NOT GRANTED to tenant_admin: audit.export. Export is platform-
 * only until a deliberate decision; tenant_admin holds audit.view (read-only).
 */
import { TRPCError } from '@trpc/server';
import { z } from 'zod';

import {
  listAuditLogs,
  getAuditLog,
  listOverrideLogs,
  getOverrideLog,
  ScopeMismatchError,
} from '@fmksa/core';

import { router, protectedProcedure } from '../trpc';
import { isPlatformAdmin } from '../middleware/org-scope';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Per-procedure permission gate. system.admin always satisfies. */
function hasPerm(
  ctx: { user: { permissions: string[] } },
  perm: string,
): boolean {
  return (
    ctx.user.permissions.includes('system.admin') ||
    ctx.user.permissions.includes(perm)
  );
}

/** Map service-layer errors to TRPC errors (NOT-FOUND-shaped on org mismatch). */
function mapAuditError(err: unknown): never {
  if (err instanceof ScopeMismatchError) {
    throw new TRPCError({
      code: 'NOT_FOUND',
      message: 'Audit log entry not found.',
      cause: err,
    });
  }
  throw err;
}

// ---------------------------------------------------------------------------
// Input schemas
// ---------------------------------------------------------------------------

const AuditListInputSchema = z.object({
  action: z.string().optional(),
  resourceType: z.string().optional(),
  actorSource: z.string().optional(),
  actorUserId: z.string().optional(),
  projectId: z.string().optional(),
  dateFrom: z.coerce.date().optional(),
  dateTo: z.coerce.date().optional(),
  skip: z.number().int().min(0).optional(),
  take: z.number().int().min(1).max(100).optional(),
});

const OverrideListInputSchema = z.object({
  overrideType: z.string().optional(),
  overriderUserId: z.string().optional(),
  dateFrom: z.coerce.date().optional(),
  dateTo: z.coerce.date().optional(),
  skip: z.number().int().min(0).optional(),
  take: z.number().int().min(1).max(100).optional(),
});

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

export const auditRouter = router({
  list: protectedProcedure
    .input(AuditListInputSchema)
    .query(async ({ ctx, input }) => {
      if (!hasPerm(ctx, 'audit.view')) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Insufficient permissions.',
        });
      }
      const expectedOrgId = isPlatformAdmin(ctx) ? null : ctx.orgId;
      return listAuditLogs({ ...input, expectedOrgId });
    }),

  get: protectedProcedure
    .input(z.object({ id: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      if (!hasPerm(ctx, 'audit.view')) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Insufficient permissions.',
        });
      }
      const expectedOrgId = isPlatformAdmin(ctx) ? null : ctx.orgId;
      try {
        const entry = await getAuditLog(input.id, expectedOrgId);
        if (!entry) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Audit log entry not found.',
          });
        }
        return entry;
      } catch (err) {
        mapAuditError(err);
      }
    }),

  overrides: protectedProcedure
    .input(OverrideListInputSchema)
    .query(async ({ ctx, input }) => {
      if (!hasPerm(ctx, 'audit.view')) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Insufficient permissions.',
        });
      }
      const expectedOrgId = isPlatformAdmin(ctx) ? null : ctx.orgId;
      return listOverrideLogs({ ...input, expectedOrgId });
    }),

  overrideDetail: protectedProcedure
    .input(z.object({ id: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      if (!hasPerm(ctx, 'audit.view')) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Insufficient permissions.',
        });
      }
      const expectedOrgId = isPlatformAdmin(ctx) ? null : ctx.orgId;
      try {
        const entry = await getOverrideLog(input.id, expectedOrgId);
        if (!entry) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Override log entry not found.',
          });
        }
        return entry;
      } catch (err) {
        mapAuditError(err);
      }
    }),
});
