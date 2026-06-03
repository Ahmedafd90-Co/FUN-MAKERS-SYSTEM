/**
 * PIC-71 PR-2 — broken-fixture for the scope-binding guard's BITE-PROOF.
 *
 * NEVER imported by production code. Only read by the static-AST guard
 * (`scope-binding-guard.test.ts`) which walks the fixture's source to verify
 * the classifier:
 *   - flags `unscopedById` as RED (no scope binding present)
 *   - flags `decorativeInline_wrongField` as RED (decorative — binds the
 *     wrong field; comparing `.id` is not a scope check)
 *   - calls `scopedById_assert` GREEN (recognises assertProjectScope)
 *   - calls `scopedById_inline` GREEN (recognises inline `record.projectId !==`)
 *   - does NOT enumerate `listScoped` (uses `where:{projectId}`, not by-id)
 *   - does NOT enumerate `createX` (uses `.create`, not a by-id fetch)
 *
 * If the guard does NOT bite this fixture exactly as documented above, the
 * guard itself is broken — same discipline PIC-49's broken-fixture imposes.
 * The fixture is the regression-lock on the guard.
 *
 * Per PD ruling 6ec04bd8 Q3: the decorative case is the CRITICAL bite — a
 * guard that just greps `!==` would false-GREEN `decorativeInline_wrongField`.
 * The classifier must verify the inline check binds an actual scope field
 * (`projectId` / `entityId` / `orgId`), not just any field.
 */
import { prisma } from '@fmksa/db';
import { assertProjectScope } from '../../src/scope-binding';

// ---------------------------------------------------------------------------
// GREEN — scope-bound by assertProjectScope call
// ---------------------------------------------------------------------------
export async function scopedById_assert(id: string, expectedProjectId: string) {
  const ipa = await prisma.ipa.findUniqueOrThrow({ where: { id } });
  assertProjectScope(ipa, expectedProjectId, 'Ipa', id);
  return ipa;
}

// ---------------------------------------------------------------------------
// GREEN — scope-bound by inline `record.projectId !==` throw
// ---------------------------------------------------------------------------
export async function scopedById_inline(id: string, expectedProjectId: string) {
  const ipc = await prisma.ipc.findUniqueOrThrow({ where: { id } });
  if (ipc.projectId !== expectedProjectId) {
    throw new Error(`Ipc '${id}' does not belong to project ${expectedProjectId}`);
  }
  return ipc;
}

// ---------------------------------------------------------------------------
// RED — no scope binding (the guard must flag this)
// ---------------------------------------------------------------------------
export async function unscopedById(id: string) {
  const variation = await prisma.variation.findUniqueOrThrow({ where: { id } });
  return variation;
}

// ---------------------------------------------------------------------------
// RED (DECORATIVE) — has an inline check, but compares `.id` not `.projectId`
// — the wrong field. Comparing `id` to a project id is tautology-shaped
// (`id` and `expectedProjectId` are unrelated UUIDs; the check never closes
// the cross-tenant gap). A guard that just greps `!==` would false-GREEN
// this; the real guard must verify the field being compared is a scope field.
// ---------------------------------------------------------------------------
export async function decorativeInline_wrongField(id: string, expectedProjectId: string) {
  const correspondence = await prisma.correspondence.findUniqueOrThrow({ where: { id } });
  if (correspondence.id !== expectedProjectId) {
    throw new Error('Decorative check — wrong field bound!');
  }
  return correspondence;
}

// ---------------------------------------------------------------------------
// EXEMPT — list with where:{projectId}; NOT a by-id read. The classifier
// must skip this (no enumeration).
// ---------------------------------------------------------------------------
export async function listScoped(projectId: string) {
  return prisma.ipa.findMany({ where: { projectId } });
}

// ---------------------------------------------------------------------------
// EXEMPT — create (no by-id fetch). The classifier must skip this.
// ---------------------------------------------------------------------------
export async function createX(projectId: string) {
  return prisma.ipa.create({
    data: {
      projectId,
      status: 'draft',
      periodNumber: 1,
      periodFrom: new Date(),
      periodTo: new Date(),
      grossAmount: 0,
      retentionRate: 0,
      retentionAmount: 0,
      previousCertified: 0,
      currentClaim: 0,
      netClaimed: 0,
      currency: 'SAR',
      createdBy: 'fixture',
    },
  });
}
