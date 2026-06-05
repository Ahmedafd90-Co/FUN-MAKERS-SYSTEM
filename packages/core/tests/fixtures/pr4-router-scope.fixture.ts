/**
 * PIC-98 PR-4a — broken-fixture for the router-layer scope-binding guard's
 * BITE-PROOF (carry-forward B).
 *
 * NEVER imported by production code. Only read by the static-AST guard
 * (`scope-binding-guard.test.ts` — router-layer describe block) which walks
 * the fixture's source to verify the classifier:
 *
 *   IDIOM A (expectedOrgId-threading — entities/projects/audit pattern):
 *     - goodConditional             → GREEN (passes `isPlatformAdmin(ctx) ? null : ctx.orgId`)
 *     - droppedExpectedOrgId        → RED (#1 — no expectedOrgId in args at all)
 *     - literalNullExpectedOrgId    → RED (#2 — THE dead-assert case;
 *                                          looks scoped, service guard stays
 *                                          green, silently bypassed. If the
 *                                          guard can't tell the conditional
 *                                          from bare `null` it's theater.)
 *     - hardcodedExpectedOrgId      → RED (#3 — wrong source; hardcoded literal)
 *
 *   IDIOM B (where-filter — admin.user* / projects.userSearch pattern):
 *     - goodWhereFilter             → GREEN (inline `where.orgId = ctx.orgId`
 *                                          inside `if (!isPlatformAdmin(ctx) && ctx.orgId)`)
 *     - droppedWhereFilter          → RED (tenant-model findMany with no
 *                                          where.orgId set)
 *
 * Per PD ruling 17d0a94b: literal-null bite (#2) is NON-NEGOTIABLE. A guard
 * that can't distinguish `isPlatformAdmin(ctx) ? null : ctx.orgId` from bare
 * `null` lets the dead-assert pattern ship green — exactly the failure mode
 * the carry-forward was opened to close.
 *
 * Why the fixture lives in @fmksa/core tests (not apps/web): the AST guard
 * itself runs in @fmksa/core's Test job (CI executes it). The fixture is
 * the regression-lock on the guard — same colocation pattern as PIC-71's
 * pic71-scope-binding.fixture.ts.
 *
 * The stubs below (Ctx / isPlatformAdmin / entitiesService) mirror the
 * apps/web shapes for AST classification only; never executed at runtime.
 */

import { prisma } from '@fmksa/db';

// ---------------------------------------------------------------------------
// Stubs — AST-only; never executed. The classifier reads identifier names,
// not types/implementations.
// ---------------------------------------------------------------------------

type Ctx = {
  user: { id: string; permissions: string[] } | null;
  orgId: string | null;
};

function isPlatformAdmin(_ctx: { user: { permissions: string[] } | null }): boolean {
  return false;
}

const entitiesService = {
  async getEntity(_id: string, _expectedOrgId: string | null): Promise<unknown> {
    return null;
  },
};

// ===========================================================================
// IDIOM A — expectedOrgId-threading (entities / projects / audit pattern)
// ===========================================================================

// ---------------------------------------------------------------------------
// GREEN — correct conditional thread
// `expectedOrgId = isPlatformAdmin(ctx) ? null : ctx.orgId`
// ---------------------------------------------------------------------------
export async function goodConditional(
  ctx: Ctx,
  input: { id: string },
): Promise<unknown> {
  const expectedOrgId = isPlatformAdmin(ctx) ? null : ctx.orgId;
  return entitiesService.getEntity(input.id, expectedOrgId);
}

// ---------------------------------------------------------------------------
// RED #1 — DROPPED: no expectedOrgId in service call args at all
// ---------------------------------------------------------------------------
export async function droppedExpectedOrgId(
  _ctx: Ctx,
  input: { id: string },
): Promise<unknown> {
  // @ts-expect-error fixture intentionally calls service with wrong arity
  return entitiesService.getEntity(input.id);
}

// ---------------------------------------------------------------------------
// RED #2 — LITERAL NULL (THE non-negotiable dead-assert case)
// Service signature: `assertOrgScope` inside `if (expectedOrgId !== null) {…}`
// → bare `null` silently bypasses the assert (service guard stays green, no
// cross-org error thrown). PD: if the guard can't tell this from the
// conditional, it's theater.
// ---------------------------------------------------------------------------
export async function literalNullExpectedOrgId(
  _ctx: Ctx,
  input: { id: string },
): Promise<unknown> {
  const expectedOrgId = null;
  return entitiesService.getEntity(input.id, expectedOrgId);
}

// ---------------------------------------------------------------------------
// RED #3 — WRONG SOURCE: hardcoded literal (or wrong ctx field). Defeats
// scoping by binding to a fixed value rather than the caller's org.
// ---------------------------------------------------------------------------
export async function hardcodedExpectedOrgId(
  _ctx: Ctx,
  input: { id: string },
): Promise<unknown> {
  const expectedOrgId = '00000000-0000-0000-0000-000000000001';
  return entitiesService.getEntity(input.id, expectedOrgId);
}

// ===========================================================================
// IDIOM B — where-filter (admin.user* / projects.userSearch pattern)
// ===========================================================================

// ---------------------------------------------------------------------------
// GREEN — correct inline where.orgId scoping
// `if (!isPlatformAdmin(ctx) && ctx.orgId) { where.orgId = ctx.orgId; }`
// ---------------------------------------------------------------------------
export async function goodWhereFilter(ctx: Ctx): Promise<unknown> {
  const where: Record<string, unknown> = {};
  if (!isPlatformAdmin(ctx) && ctx.orgId) {
    where.orgId = ctx.orgId;
  }
  return prisma.user.findMany({ where });
}

// ---------------------------------------------------------------------------
// RED — DROPPED where.orgId: tenant-model findMany with no where.orgId
// (the analog of #1 for Idiom B)
// ---------------------------------------------------------------------------
export async function droppedWhereFilter(_ctx: Ctx): Promise<unknown> {
  return prisma.user.findMany({});
}
