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

// ---------------------------------------------------------------------------
// PIC-96 (F2) — universal orgId coverage on the 17 Bucket-2 leaf models.
//
// F2 extended orgId from the 3 backbone nodes to the 17 transactional models
// F3 will org-filter directly. Same invariant as the F1 block: after seed,
// every Bucket-2 row carries a non-null org_id that FK-resolves to a real
// Organization. Raw-SQL probes (the types say org_id is non-null; this is the
// honest test for a drift that re-introduced a NULL/orphan). Tables are
// physically present even if the seed produced 0 rows for some — a 0-row table
// trivially satisfies "no null org_id", which is correct (nothing to violate);
// the F1 block already guards against a vacuous *backbone*.
//
// Bucket-2 surface (17): the org-bearing transactional roots. Bucket-3 pure
// children + join/settings tables (ProjectSetting/ScreenPermission/
// ProjectAssignment/ProjectVendor/ReferenceCounter/EntityLegalDetails/
// PrimeContract) deliberately have NO org_id and are NOT checked here.
// ---------------------------------------------------------------------------

const F2_BUCKET2_TABLES = [
  'workflow_instances',
  'documents',
  'posting_events',
  'budget_absorption_exceptions',
  'audit_logs',
  'vendors',
  'procurement_categories',
  'item_catalogs',
  'framework_agreements',
  'supplier_invoices',
  'expenses',
  'credit_notes',
  'project_budgets',
  'import_batches',
  'project_participants',
  'intercompany_contracts',
  'drawings',
] as const;

describe('Spine integrity — PIC-96 (F2) universal orgId coverage', () => {
  it('all 17 Bucket-2 tables physically have an org_id column', async () => {
    // Catches a schema/migration drift that dropped a column. information_schema
    // is the source of truth — independent of whether any rows exist.
    const n = await rawCount(
      prisma.$queryRaw`SELECT count(*)::bigint AS count
        FROM information_schema.columns
       WHERE table_schema = 'public'
         AND column_name = 'org_id'
         AND table_name IN (
           'workflow_instances','documents','posting_events',
           'budget_absorption_exceptions','audit_logs','vendors',
           'procurement_categories','item_catalogs','framework_agreements',
           'supplier_invoices','expenses','credit_notes','project_budgets',
           'import_batches','project_participants','intercompany_contracts',
           'drawings')`,
    );
    expect(n).toBe(17);
  });

  for (const table of F2_BUCKET2_TABLES) {
    it(`${table}: no null org_id + no orphan org_id FK`, async () => {
      const nulls = await rawCount(
        prisma.$queryRawUnsafe(
          `SELECT count(*)::bigint AS count FROM "${table}" WHERE org_id IS NULL`,
        ) as Promise<{ count: bigint }[]>,
      );
      expect(nulls).toBe(0);

      const orphans = await rawCount(
        prisma.$queryRawUnsafe(
          `SELECT count(*)::bigint AS count
             FROM "${table}" t LEFT JOIN organizations o ON t.org_id = o.id
            WHERE o.id IS NULL`,
        ) as Promise<{ count: bigint }[]>,
      );
      expect(orphans).toBe(0);
    });
  }
});

// ---------------------------------------------------------------------------
// PIC-96 (F2) — code uniqueness is per-tenant, not global.
// ---------------------------------------------------------------------------

describe('Spine integrity — PIC-96 (F2) per-tenant code uniqueness', () => {
  it('entities + projects carry the org-scoped compound unique index (not the old global one)', async () => {
    // The re-key: entities_code_key/projects_code_key (global) →
    // entities_org_id_code_key/projects_org_id_code_key (per-tenant).
    // Assert the new compound indexes exist AND the old globals are gone — a
    // drift in either direction (forgot to drop, forgot to create) fails here.
    const compound = await rawCount(
      prisma.$queryRaw`SELECT count(*)::bigint AS count
        FROM pg_indexes
       WHERE schemaname = 'public'
         AND indexname IN ('entities_org_id_code_key','projects_org_id_code_key')`,
    );
    expect(compound).toBe(2);

    const oldGlobals = await rawCount(
      prisma.$queryRaw`SELECT count(*)::bigint AS count
        FROM pg_indexes
       WHERE schemaname = 'public'
         AND indexname IN ('entities_code_key','projects_code_key')`,
    );
    expect(oldGlobals).toBe(0);
  });
});
