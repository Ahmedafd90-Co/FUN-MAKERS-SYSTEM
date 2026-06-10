/**
 * PIC-108-A — broken-fixture for the WRITE-side scope guard's BITE-PROOF.
 *
 * NEVER imported by production code. Only read by the static-AST guard
 * (`write-scope-guard.test.ts`) which walks this fixture's source to verify
 * the write-mode classifier:
 *   - flags `createOmitsOrgId` as RED       (no orgId in data → relies on @default)
 *   - flags `createLiteralSingleton` as RED (orgId: '0000…001' literal → theater,
 *     the F4 literal-null analogue — looks scoped, supplies a dead constant)
 *   - flags `createConditionalSpread` as RED (the `...(cond ? {orgId} : {})` spread
 *     can OMIT orgId in its else-branch → exactly the trap @default removal closes;
 *     PD ee453310: require UNCONDITIONAL supply)
 *   - flags `txOmitsOrgId` as RED           (proves the detector is CLIENT-AGNOSTIC —
 *     a `(tx as any).<model>.create` omit bites, not just `prisma.` — read-mode's
 *     hard ===prisma would miss this; purchase-order:69 / materialisation:175 use tx)
 *   - calls `createSuppliesOrgId` GREEN     (orgId sourced from a dynamic value)
 *   - calls `upsertSuppliesOrgId` GREEN     (orgId in the upsert `create:` branch)
 *   - does NOT enumerate `notATenantModel`  (workflowAction ∉ WRITE_TENANT_MODELS)
 *
 * If the guard does NOT bite this fixture exactly as documented above, the
 * guard itself is broken — same discipline PIC-49 / PIC-71 broken-fixtures impose.
 */
import { prisma } from '@fmksa/db';

// ---------------------------------------------------------------------------
// GREEN — orgId supplied from a dynamic value (shorthand → a variable)
// ---------------------------------------------------------------------------
export async function createSuppliesOrgId(orgId: string, projectId: string) {
  return prisma.ipa.create({
    data: {
      orgId,
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

// ---------------------------------------------------------------------------
// RED (BITE) — data omits orgId → relies on the @default singleton
// ---------------------------------------------------------------------------
export async function createOmitsOrgId(projectId: string) {
  return prisma.ipa.create({
    // @ts-expect-error PIC-108-G-final: intentional omit — this fixture IS the write-scope-guard bite-proof; supplying orgId destroys the omit-detection test
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

// ---------------------------------------------------------------------------
// RED (BITE — literal/theater) — orgId is the singleton string literal. Looks
// scoped, supplies a dead constant; at tenant #2 it mis-attributes to tenant #1.
// The write-mode analogue of F4's literal-null bite.
// ---------------------------------------------------------------------------
export async function createLiteralSingleton(projectId: string) {
  return prisma.ipa.create({
    data: {
      orgId: '00000000-0000-0000-0000-000000000001',
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

// ---------------------------------------------------------------------------
// RED (BITE — conditional spread) — orgId is NOT a direct property; the
// `...(cond ? {orgId} : {})` else-branch omits it → can land the @default.
// PD ee453310 requires UNCONDITIONAL supply, so this must fail.
// ---------------------------------------------------------------------------
export async function createConditionalSpread(
  cond: boolean,
  orgId: string,
  name: string,
  email: string,
) {
  return (prisma as { user: { create: (a: unknown) => Promise<unknown> } }).user.create({
    data: {
      ...(cond ? { orgId } : {}),
      name,
      email,
    },
  });
}

// ---------------------------------------------------------------------------
// GREEN — orgId supplied in the upsert `create:` (insert) branch
// ---------------------------------------------------------------------------
export async function upsertSuppliesOrgId(orgId: string, id: string, projectId: string) {
  return prisma.ipa.upsert({
    where: { id },
    update: {},
    create: {
      orgId,
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

// ---------------------------------------------------------------------------
// RED (BITE — client-agnostic) — a transaction-scoped create on a tenant model
// that omits orgId. Proves the detector matches ANY client identifier
// (`(tx as any).ipa.create`), not just the literal `prisma.` accessor.
// ---------------------------------------------------------------------------
export async function txOmitsOrgId(tx: unknown, projectId: string) {
  return (tx as { ipa: { create: (a: unknown) => Promise<unknown> } }).ipa.create({
    data: {
      projectId,
      status: 'draft',
    },
  });
}

// ---------------------------------------------------------------------------
// SKIP — workflowAction is NOT a WRITE_TENANT_MODEL (child table, no orgId,
// scoped transitively via its workflow_instance). The detector must not
// enumerate it.
// ---------------------------------------------------------------------------
export async function notATenantModel(instanceId: string) {
  return (prisma as { workflowAction: { create: (a: unknown) => Promise<unknown> } }).workflowAction.create({
    data: {
      instanceId,
    },
  });
}
