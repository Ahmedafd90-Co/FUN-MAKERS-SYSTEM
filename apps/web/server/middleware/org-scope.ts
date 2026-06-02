/**
 * orgScope helpers — PIC-97 (F3) tenant-isolation primitives.
 *
 * F3 turns org isolation LIVE. Two surfaces use these:
 *   1. The chokepoints (verifyProjectAccess / verifyEntityAccess) — assert the
 *      target's org matches the caller's, closing the cross_project.read /
 *      system.admin cross-org fallbacks.
 *   2. The protectedProcedure holes that bypass the chokepoints (import.*,
 *      workflow.instances.getByRecord, entities.ancestors/descendants/siblings,
 *      engineerInstruction.get) — filter lists by org, NOT-FOUND-shape by-id reads.
 *
 * Invariants (PD-ruled, binding):
 *   - DENY-BY-DEFAULT / FAIL-CLOSED: a null/undefined orgId on EITHER side never
 *     passes — it throws. Single-tenant correctness must not depend on a null
 *     happening to compare equal.
 *   - NOT-FOUND-shaped by-id denials: a wrong-org record returns the SAME response
 *     as a non-existent id. A "forbidden: belongs to org B" confirms existence =
 *     a cross-tenant info leak.
 *   - system.admin is the platform-admin bypass — preserved here; F4 splits it.
 */
import { TRPCError } from '@trpc/server';

export const SYSTEM_ADMIN_PERMISSION = 'system.admin';

type OrgCtx = {
  user: { permissions: string[] } | null;
  orgId: string | null;
};

/** True when the caller holds the platform-admin (system.admin) bypass. */
export function isPlatformAdmin(ctx: { user: { permissions: string[] } | null }): boolean {
  return ctx.user?.permissions.includes(SYSTEM_ADMIN_PERMISSION) ?? false;
}

/**
 * Deny-by-default tenant match. Returns true ONLY when both orgIds are present
 * and equal (or the caller is a platform-admin). A null/undefined on either side
 * returns false — fail closed.
 */
export function orgMatches(
  ctxOrgId: string | null | undefined,
  targetOrgId: string | null | undefined,
  platformAdmin: boolean,
): boolean {
  if (platformAdmin) return true;
  if (!ctxOrgId || !targetOrgId) return false;
  return ctxOrgId === targetOrgId;
}

/**
 * NOT-FOUND-shaped by-id org guard for the protectedProcedure by-id holes. Throws
 * an identical NOT_FOUND for both a missing record and an org-B record (no
 * existence disclosure). Returns the record on success.
 */
export function assertRecordOrgOrNotFound<T extends { orgId: string | null }>(
  record: T | null | undefined,
  ctx: OrgCtx,
  label: string,
): T {
  if (
    record &&
    orgMatches(ctx.orgId, record.orgId, isPlatformAdmin(ctx))
  ) {
    return record;
  }
  throw new TRPCError({ code: 'NOT_FOUND', message: `${label} not found.` });
}

/**
 * NULL-shaped by-id org guard — for endpoints whose own not-found response is
 * `null` (not a NOT_FOUND throw), e.g. workflow.getByRecord. Returns the record
 * when same-org (or platform-admin); otherwise `null` — indistinguishable from
 * a record that has no row, so no existence disclosure.
 */
export function recordInOrgOrNull<T extends { orgId: string | null }>(
  record: T | null | undefined,
  ctx: OrgCtx,
): T | null {
  if (record && orgMatches(ctx.orgId, record.orgId, isPlatformAdmin(ctx))) {
    return record;
  }
  return null;
}

/**
 * The org filter for the protectedProcedure list holes. Returns `undefined` for a
 * platform-admin (sees all orgs); otherwise the caller's org to inject into the
 * query `where`. Fail-closed: a non-admin with no tenant context throws FORBIDDEN.
 */
export function listOrgScope(ctx: OrgCtx): string | undefined {
  if (isPlatformAdmin(ctx)) return undefined;
  if (!ctx.orgId) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'No tenant context is available for this request.',
    });
  }
  return ctx.orgId;
}
