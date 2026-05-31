/**
 * Spine-integrity tests — PIC-95 (F1) org-hierarchy backbone.
 *
 * F1 turned the disconnected Organization singleton (PIC-75) into the real
 * tenant root by adding the backbone edges Org → Entity → Project and
 * User → Org. These tests lock the structural invariant the migration
 * establishes: after seeding, EVERY backbone row (Entity, User, Project)
 * carries a non-null orgId that FK-resolves to a real Organization, and
 * Project.orgId matches its Entity.orgId (the PA4 denormalization invariant).
 *
 * This is the F1 regression net. If a future seed change, migration, or
 * schema edit drops a backbone row's org linkage — or points it at a
 * non-existent org, or lets Project.orgId drift from its entity — these tests
 * fail loudly in CI rather than letting a tenancy-spine hole ship silently
 * (the failure class F3 enforcement will later depend on being closed).
 *
 * F1 scope note: orgId is UNENFORCED at the app layer here — the @default
 * singleton backfill is what populates these columns. These tests assert the
 * backfill invariant holds, NOT that any resolver enforces org-scope (that
 * is F3). They are deliberately data-level, mirroring demo-project-integrity.
 *
 * Uses `new PrismaClient()` (the seed-coverage / idempotency pattern) — a
 * plain client assignable to the seed fns' PrismaClient param, re-routed to
 * fmksa_test by the setup-test-db.ts setupFile. The structural probes are raw
 * SQL: an honest test for a NULL/orphan the Prisma types say is impossible —
 * which is exactly what catches a schema/migration drift that re-introduced
 * one.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';

import { assertTestDb } from '../helpers/assert-test-db';
import { seedOrganizations, SINGLETON_ORG_ID } from '../../src/seed/organizations';
import { seedCountries } from '../../src/seed/countries';
import { seedCurrencies } from '../../src/seed/currencies';
import { seedSampleEntity } from '../../src/seed/sample-entity';
import { seedSampleProject } from '../../src/seed/sample-project';
import { seedRoles } from '../../src/seed/roles';
import { seedMasterAdmin } from '../../src/seed/master-admin';

const prisma = new PrismaClient();

/** Raw count helper — returns the single bigint count, guarded for TS. */
async function rawCount(sql: Promise<{ count: bigint }[]>): Promise<number> {
  const rows = await sql;
  return rows.length > 0 ? Number(rows[0]!.count) : -1;
}

// ---------------------------------------------------------------------------
// Fixture — seed the backbone in dependency order (org → entity → project,
// plus roles + master-admin so the User backbone has rows to assert against).
// ---------------------------------------------------------------------------

beforeAll(async () => {
  // PIC-37: refuse to write seed data against any DB whose URL lacks `_test`.
  assertTestDb();
  await seedOrganizations(prisma);
  await seedCountries(prisma);
  await seedCurrencies(prisma);
  await seedSampleEntity(prisma);
  await seedSampleProject(prisma);
  await seedRoles(prisma);
  await seedMasterAdmin(prisma);
}, 60_000);

afterAll(async () => {
  await prisma.$disconnect();
});

// ---------------------------------------------------------------------------
// Org root present
// ---------------------------------------------------------------------------

describe('Spine integrity — Organization tenant root (PIC-95 F1)', () => {
  it('the singleton organization exists', async () => {
    const org = await prisma.organization.findUnique({
      where: { id: SINGLETON_ORG_ID },
    });
    expect(org).not.toBeNull();
    expect(org?.slug).toBe('picoplay-ksa');
  });
});

// ---------------------------------------------------------------------------
// Backbone edges — no null orgId, no orphan orgId, on every backbone model
// ---------------------------------------------------------------------------

describe('Spine integrity — backbone orgId coverage (PIC-95 F1)', () => {
  it('there is at least one Entity, User, and Project to verify', async () => {
    // Guards against a vacuous pass: if the backbone tables were empty the
    // "no null orgId" checks below would trivially hold. Assert the fixture
    // actually produced backbone rows.
    expect(await prisma.entity.count()).toBeGreaterThan(0);
    expect(await prisma.user.count()).toBeGreaterThan(0);
    expect(await prisma.project.count()).toBeGreaterThan(0);
  });

  it('every Entity has a non-null orgId (singleton-default backfill)', async () => {
    const n = await rawCount(
      prisma.$queryRaw`SELECT count(*)::bigint AS count FROM entities WHERE org_id IS NULL`,
    );
    expect(n).toBe(0);
  });

  it('every User has a non-null orgId', async () => {
    const n = await rawCount(
      prisma.$queryRaw`SELECT count(*)::bigint AS count FROM users WHERE org_id IS NULL`,
    );
    expect(n).toBe(0);
  });

  it('every Project has a non-null orgId', async () => {
    const n = await rawCount(
      prisma.$queryRaw`SELECT count(*)::bigint AS count FROM projects WHERE org_id IS NULL`,
    );
    expect(n).toBe(0);
  });

  it('no Entity orgId points at a non-existent organization (FK integrity)', async () => {
    const n = await rawCount(
      prisma.$queryRaw`SELECT count(*)::bigint AS count
        FROM entities e LEFT JOIN organizations o ON e.org_id = o.id
       WHERE o.id IS NULL`,
    );
    expect(n).toBe(0);
  });

  it('no User orgId points at a non-existent organization (FK integrity)', async () => {
    const n = await rawCount(
      prisma.$queryRaw`SELECT count(*)::bigint AS count
        FROM users u LEFT JOIN organizations o ON u.org_id = o.id
       WHERE o.id IS NULL`,
    );
    expect(n).toBe(0);
  });

  it('no Project orgId points at a non-existent organization (FK integrity)', async () => {
    const n = await rawCount(
      prisma.$queryRaw`SELECT count(*)::bigint AS count
        FROM projects p LEFT JOIN organizations o ON p.org_id = o.id
       WHERE o.id IS NULL`,
    );
    expect(n).toBe(0);
  });

  it('Project.orgId matches its Entity.orgId (denormalization is consistent)', async () => {
    // PA4 ruling: Project.orgId is denormalized from Entity.orgId. During the
    // single-tenant phase both are the singleton via @default, so they must
    // agree. This locks the denormalization invariant F3 will rely on — if a
    // future create-path sets Project.orgId divergent from its entity, fail.
    const n = await rawCount(
      prisma.$queryRaw`SELECT count(*)::bigint AS count
        FROM projects p JOIN entities e ON p.entity_id = e.id
       WHERE p.org_id <> e.org_id`,
    );
    expect(n).toBe(0);
  });
});
