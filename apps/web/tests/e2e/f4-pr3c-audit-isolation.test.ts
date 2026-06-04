/**
 * E2E: F4 PR-3c (PIC-98) — tenant_admin reachability on audit.* surfaces.
 *
 * Real RED→GREEN proofs on a 2nd org for the four audit surfaces converted
 * from adminProcedure → protectedProcedure + hasPerm('audit.view') + service-
 * layer org-scope via direct denormalized orgId columns (no JOIN).
 *
 *   D1 audit.list cross-org
 *     tenant_admin in org A lists audit logs.
 *     RED on pre-PR-3c main: would return BOTH org-A and org-B audit entries
 *     (zero scoping; adminProcedure-only with no service-side org filter).
 *     GREEN: returns ONLY org-A entries; the SECRET org-B audit row is NOT
 *     in the result (no cross-org row disclosure).
 *
 *   D2 audit.get by-id cross-org
 *     tenant_admin in org A fetches an org-B audit log by id.
 *     RED: returns the org-B audit record (cross-org disclosure — actor, action,
 *     resource, before/after JSON all leak).
 *     GREEN: NOT_FOUND-shaped (no existence disclosure; same response as
 *     fetching a fake id — mirror F3 isolation pattern).
 *
 *   D3 audit.overrides cross-org — REAL CROSS-TENANT OVERRIDE READ
 *     PD ruling 18b4853c Q4: "D3/D4 must exercise REAL cross-tenant override
 *     reads (tenant_admin org-A actually retrieves an org-B override log
 *     pre-fix)". This is the CRITICAL proof: OverrideLog.orgId was the F2 gap
 *     PR-2 closed; PR-3c is the consumer.
 *     RED: returns BOTH org-A and org-B override entries.
 *     GREEN: returns ONLY org-A override entries; the SECRET org-B override
 *     row is NOT in the result.
 *
 *   D4 audit.overrideDetail by-id cross-org — REAL CROSS-TENANT OVERRIDE READ
 *     tenant_admin in org A fetches an org-B override log by id.
 *     RED: returns the org-B override record (reason, beforeJson, afterJson
 *     all leak).
 *     GREEN: NOT_FOUND-shaped.
 *
 *   CAT-D platform_admin STILL crosses (D3 survives)
 *     The CRITICAL over-correction check: if PR-3c locks platform_admin out
 *     of cross-org audit reads, ops/incident-response silently breaks. F3 D3
 *     survives by construction (isPlatformAdmin(ctx) returns true →
 *     expectedOrgId = null → service-layer where filter not applied + by-id
 *     assertOrgScope skipped).
 *
 *   POS positive-path
 *     tenant_admin in org A can read own-org audit + override entries. A
 *     normal tenant operation must not break under the new scoping.
 *
 * audit.export NOT EXERCISED — not a router procedure today; PR-3c grants
 * tenant_admin audit.view (read-only) and explicitly NOT audit.export.
 *
 * Real-DB (fmksa_test). The tenant_admin role + curated grants (now
 * including audit.view) are seeded before the test runs.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '@fmksa/db';
import { assertTestDb } from '../helpers/assert-test-db';
import { makeCtx, loadAuthUser } from '../helpers/auth-test-callers';
import { appRouter } from '../../server/routers/_app';
import type { AuthUser } from '@fmksa/core';

const ts = Date.now();

function past(days: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d;
}

let orgAId: string;
let orgBId: string;
let tenantAdminA: AuthUser; // org A, tenant_admin role
let platformAdminA: AuthUser; // org A, platform_admin role (D3 survives test)

// Audit + override fixtures
let auditA1Id: string; // org A — own-org audit (POS path)
let auditB1Id: string; // org B — cross-tenant target (D1/D2)
let overrideA1Id: string; // org A — own-org override (POS path)
let overrideB1Id: string; // org B — cross-tenant target (D3/D4)
const auditIds: string[] = [];
const overrideIds: string[] = [];
const userIds: string[] = [];

beforeAll(async () => {
  assertTestDb();
  process.env.SEED_CONTEXT = 'true';

  // --- Orgs ---
  const orgA = await prisma.organization.create({
    data: { slug: `f4-pr3c-a-${ts}`, name: 'F4 PR-3c Org A' },
  });
  const orgB = await prisma.organization.create({
    data: { slug: `f4-pr3c-b-${ts}`, name: 'F4 PR-3c Org B' },
  });
  orgAId = orgA.id;
  orgBId = orgB.id;

  // --- Look up seeded roles ---
  const tenantAdminRole = await prisma.role.findFirstOrThrow({
    where: { code: 'tenant_admin' },
  });
  const platformAdminRole = await prisma.role.findFirstOrThrow({
    where: { code: 'platform_admin' },
  });

  // --- Org A: tenant_admin caller ---
  const tenantAdminUserA = await prisma.user.create({
    data: {
      orgId: orgAId,
      email: `f4-pr3c-tenant-admin-${ts}@test.com`,
      name: 'F4 PR-3c Tenant Admin A',
      passwordHash: 'test-hash',
      status: 'active',
    },
  });
  userIds.push(tenantAdminUserA.id);
  await prisma.userRole.create({
    data: {
      userId: tenantAdminUserA.id,
      roleId: tenantAdminRole.id,
      effectiveFrom: past(10),
      assignedBy: 'test',
      assignedAt: new Date(),
    },
  });

  // --- Org A: platform_admin caller (CAT-D) ---
  const platformAdminUserA = await prisma.user.create({
    data: {
      orgId: orgAId,
      email: `f4-pr3c-platform-admin-${ts}@test.com`,
      name: 'F4 PR-3c Platform Admin A',
      passwordHash: 'test-hash',
      status: 'active',
    },
  });
  userIds.push(platformAdminUserA.id);
  await prisma.userRole.create({
    data: {
      userId: platformAdminUserA.id,
      roleId: platformAdminRole.id,
      effectiveFrom: past(10),
      assignedBy: 'test',
      assignedAt: new Date(),
    },
  });

  // --- Audit + override fixtures ---
  // Org A audit row (POS path)
  const auditA1 = await prisma.auditLog.create({
    data: {
      orgId: orgAId,
      actorUserId: tenantAdminUserA.id,
      actorSource: 'user',
      action: 'project.create',
      resourceType: 'project',
      resourceId: `proj-A-${ts}`,
      beforeJson: {},
      afterJson: { name: 'F4 PR-3c Org-A audit row' },
    },
  });
  auditA1Id = auditA1.id;
  auditIds.push(auditA1Id);

  // Org B audit row (the SECRET cross-tenant target)
  const auditB1 = await prisma.auditLog.create({
    data: {
      orgId: orgBId,
      actorUserId: null,
      actorSource: 'user',
      action: 'project.create',
      resourceType: 'project',
      resourceId: `proj-B-SECRET-${ts}`,
      beforeJson: {},
      afterJson: { name: 'F4 PR-3c Org-B SECRET audit row' },
    },
  });
  auditB1Id = auditB1.id;
  auditIds.push(auditB1Id);

  // Org A override row (POS path) — must reference an audit_log_id
  const overrideA1 = await prisma.overrideLog.create({
    data: {
      orgId: orgAId,
      auditLogId: auditA1Id,
      overrideType: 'workflow.skip',
      overriderUserId: tenantAdminUserA.id,
      reason: 'F4 PR-3c Org-A override (own-org POS path)',
      beforeJson: { state: 'pending' },
      afterJson: { state: 'approved' },
    },
  });
  overrideA1Id = overrideA1.id;
  overrideIds.push(overrideA1Id);

  // Org B override row (the SECRET cross-tenant target)
  const overrideB1 = await prisma.overrideLog.create({
    data: {
      orgId: orgBId,
      auditLogId: auditB1Id,
      overrideType: 'workflow.skip',
      overriderUserId: platformAdminUserA.id, // any user; not relevant to the leak surface
      reason: 'F4 PR-3c Org-B SECRET override (the cross-tenant target)',
      beforeJson: { state: 'pending' },
      afterJson: { state: 'approved' },
    },
  });
  overrideB1Id = overrideB1.id;
  overrideIds.push(overrideB1Id);

  // --- Load AuthUsers for the callers ---
  tenantAdminA = await loadAuthUser(tenantAdminUserA.id);
  platformAdminA = await loadAuthUser(platformAdminUserA.id);

  delete process.env.SEED_CONTEXT;
}, 60_000);

afterAll(async () => {
  process.env.SEED_CONTEXT = 'true';
  // AuditLog + OverrideLog are append-only (no-delete-on-immutable middleware
  // blocks deleteMany even under SEED_CONTEXT). Use raw SQL to clean up the
  // test fixtures — must remove overrides FIRST (FK constraint to audit_logs).
  if (overrideIds.length > 0) {
    await prisma.$executeRawUnsafe(
      `DELETE FROM override_logs WHERE id = ANY($1::text[])`,
      overrideIds,
    );
  }
  if (auditIds.length > 0) {
    await prisma.$executeRawUnsafe(
      `DELETE FROM audit_logs WHERE id = ANY($1::text[])`,
      auditIds,
    );
  }
  await prisma.userRole.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  await prisma.organization.deleteMany({
    where: { id: { in: [orgAId, orgBId] } },
  });
  delete process.env.SEED_CONTEXT;
}, 60_000);

describe('F4 PR-3c (PIC-98) — tenant_admin reachability on audit.* surfaces', () => {
  // ---------------------------------------------------------------------
  // D1 — audit.list cross-org
  // ---------------------------------------------------------------------
  it('D1: tenant_admin org-A audit.list returns ONLY org-A entries (no org-B leak)', async () => {
    const caller = appRouter.createCaller(makeCtx(tenantAdminA));
    const result = await caller.audit.list({ skip: 0, take: 100 });
    const ids = result.items.map((i) => i.id);
    expect(ids, 'org-B SECRET audit id must NOT leak to tenant_admin org-A').not.toContain(auditB1Id);
    expect(ids, 'own-org audit row must appear').toContain(auditA1Id);
  });

  // ---------------------------------------------------------------------
  // D2 — audit.get by-id cross-org
  // ---------------------------------------------------------------------
  it('D2: tenant_admin org-A audit.get(org-B-audit-id) → NOT_FOUND (no existence disclosure)', async () => {
    const caller = appRouter.createCaller(makeCtx(tenantAdminA));
    await expect(
      caller.audit.get({ id: auditB1Id }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  // ---------------------------------------------------------------------
  // D3 — audit.overrides cross-org (REAL cross-tenant override read)
  // ---------------------------------------------------------------------
  it('D3: tenant_admin org-A audit.overrides returns ONLY org-A overrides (real cross-tenant proof)', async () => {
    const caller = appRouter.createCaller(makeCtx(tenantAdminA));
    const result = await caller.audit.overrides({ skip: 0, take: 100 });
    const ids = result.items.map((i) => i.id);
    expect(ids, 'org-B SECRET override id must NOT leak to tenant_admin org-A').not.toContain(overrideB1Id);
    expect(ids, 'own-org override row must appear').toContain(overrideA1Id);
  });

  // ---------------------------------------------------------------------
  // D4 — audit.overrideDetail by-id cross-org (REAL cross-tenant by-id read)
  // ---------------------------------------------------------------------
  it('D4: tenant_admin org-A audit.overrideDetail(org-B-override-id) → NOT_FOUND', async () => {
    const caller = appRouter.createCaller(makeCtx(tenantAdminA));
    await expect(
      caller.audit.overrideDetail({ id: overrideB1Id }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  // ---------------------------------------------------------------------
  // CAT-D — platform_admin STILL crosses (D3 survives)
  // ---------------------------------------------------------------------
  it('CAT-D: platform_admin CAN list audit entries across orgs (D3 survives)', async () => {
    const caller = appRouter.createCaller(makeCtx(platformAdminA));
    const result = await caller.audit.list({ skip: 0, take: 100 });
    const ids = result.items.map((i) => i.id);
    expect(ids, 'platform_admin sees own-org audit').toContain(auditA1Id);
    expect(ids, 'platform_admin STILL sees org-B audit (D3 cross-org bypass)').toContain(auditB1Id);
  });

  it('CAT-D: platform_admin CAN audit.get(org-B-audit-id) (D3 survives)', async () => {
    const caller = appRouter.createCaller(makeCtx(platformAdminA));
    const entry = await caller.audit.get({ id: auditB1Id });
    expect(entry.id).toBe(auditB1Id);
    expect(entry.orgId).toBe(orgBId);
  });

  it('CAT-D: platform_admin CAN list override entries across orgs (D3 survives)', async () => {
    const caller = appRouter.createCaller(makeCtx(platformAdminA));
    const result = await caller.audit.overrides({ skip: 0, take: 100 });
    const ids = result.items.map((i) => i.id);
    expect(ids, 'platform_admin sees own-org override').toContain(overrideA1Id);
    expect(ids, 'platform_admin STILL sees org-B override (D3 cross-org bypass)').toContain(overrideB1Id);
  });

  it('CAT-D: platform_admin CAN audit.overrideDetail(org-B-override-id) (D3 survives)', async () => {
    const caller = appRouter.createCaller(makeCtx(platformAdminA));
    const entry = await caller.audit.overrideDetail({ id: overrideB1Id });
    expect(entry.id).toBe(overrideB1Id);
    expect(entry.orgId).toBe(orgBId);
  });

  // ---------------------------------------------------------------------
  // POS — positive path (tenant_admin can do own-org reads)
  // ---------------------------------------------------------------------
  it('POS: tenant_admin org-A CAN audit.get(own-org-audit-id)', async () => {
    const caller = appRouter.createCaller(makeCtx(tenantAdminA));
    const entry = await caller.audit.get({ id: auditA1Id });
    expect(entry.id).toBe(auditA1Id);
    expect(entry.orgId).toBe(orgAId);
  });

  it('POS: tenant_admin org-A CAN audit.overrideDetail(own-org-override-id)', async () => {
    const caller = appRouter.createCaller(makeCtx(tenantAdminA));
    const entry = await caller.audit.overrideDetail({ id: overrideA1Id });
    expect(entry.id).toBe(overrideA1Id);
    expect(entry.orgId).toBe(orgAId);
  });
});
