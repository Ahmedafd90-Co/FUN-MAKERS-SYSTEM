import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { assertTestDb } from '../helpers/assert-test-db';
import { seedCountries } from '../../src/seed/countries';
import { seedCurrencies } from '../../src/seed/currencies';
import { seedAppSettings } from '../../src/seed/app-settings';
import { seedStatusDictionaries } from '../../src/seed/status-dictionaries';
import { seedPermissions } from '../../src/seed/permissions';
import { seedRoles } from '../../src/seed/roles';
import { seedRolePermissions } from '../../src/seed/role-permissions';
import { seedNotificationTemplates } from '../../src/seed/notification-templates';
import { seedSampleEntity } from '../../src/seed/sample-entity';
import { seedSampleProject } from '../../src/seed/sample-project';
import { seedMasterAdmin } from '../../src/seed/master-admin';

/**
 * Task 1.2.20 -- Seed idempotency integration test.
 *
 * Runs the full seed sequence twice and verifies that row counts in every
 * seeded table are identical after both runs.  This proves that every seed
 * function uses upsert / conditional-create correctly and never introduces
 * duplicates.
 */

const prisma = new PrismaClient();

/** Run every seed function in dependency order. */
async function runFullSeed() {
  await seedCountries(prisma);
  await seedCurrencies(prisma);
  await seedAppSettings(prisma);
  await seedStatusDictionaries(prisma);
  await seedPermissions(prisma);
  await seedRoles(prisma);
  await seedRolePermissions(prisma);
  await seedNotificationTemplates(prisma);
  await seedSampleEntity(prisma);
  await seedSampleProject(prisma);
  await seedMasterAdmin(prisma);
}

/** Snapshot row counts for all seeded tables. */
async function snapshotCounts() {
  const [
    countries,
    currencies,
    appSettings,
    statusDictionaries,
    permissions,
    roles,
    rolePermissions,
    notificationTemplates,
    entities,
    projects,
    users,
    userRoles,
    projectAssignments,
  ] = await Promise.all([
    prisma.country.count(),
    prisma.currency.count(),
    prisma.appSetting.count(),
    prisma.statusDictionary.count(),
    prisma.permission.count(),
    prisma.role.count(),
    prisma.rolePermission.count(),
    prisma.notificationTemplate.count(),
    prisma.entity.count(),
    prisma.project.count(),
    prisma.user.count(),
    prisma.userRole.count(),
    prisma.projectAssignment.count(),
  ]);

  return {
    countries,
    currencies,
    appSettings,
    statusDictionaries,
    permissions,
    roles,
    rolePermissions,
    notificationTemplates,
    entities,
    projects,
    users,
    userRoles,
    projectAssignments,
  };
}

/**
 * PIC-76 PROBE — verbose row-counts diagnostic for CI capture.
 *
 * THROWAWAY INSTRUMENTATION. Branch `probe/pic-76-row-counts-debug` only.
 * Captures table counts + pg_stat_activity at 6 checkpoints to identify
 * the CI-side mechanism causing `snapshot1 > snapshot2` (mathematically
 * impossible from upsert-only runFullSeed; β2 ruled out per Phase A;
 * β4 multi-PrismaClient is leading hypothesis).
 */
type ProbePgActivity = {
  pid: number;
  application_name: string | null;
  state: string | null;
  query: string;
};

async function probeStep(label: string): Promise<void> {
  const ts = new Date().toISOString();
  console.log(`\n[PROBE ${ts}] ${label}`);

  // Capture full snapshot counts for table-by-table comparison
  try {
    const counts = await snapshotCounts();
    console.log(`[PROBE]   counts: ${JSON.stringify(counts)}`);
  } catch (e) {
    console.log(`[PROBE]   counts: ERROR ${(e as Error).message}`);
  }

  // Capture pg_stat_activity for connection pool / async-query visibility
  try {
    const activity = await prisma.$queryRaw<ProbePgActivity[]>`
      SELECT
        pid,
        application_name,
        state,
        LEFT(COALESCE(query, ''), 100) AS query
      FROM pg_stat_activity
      WHERE datname = current_database()
      ORDER BY pid
    `;
    console.log(`[PROBE]   pg_stat_activity (${activity.length} rows):`);
    activity.forEach((row) =>
      console.log(
        `[PROBE]     pid=${row.pid} state=${row.state ?? 'null'} app=${row.application_name ?? 'null'} query="${row.query}"`,
      ),
    );
  } catch (e) {
    console.log(`[PROBE]   pg_stat_activity: ERROR ${(e as Error).message}`);
  }
}

describe('seed idempotency', () => {
  let firstRunCounts: Awaited<ReturnType<typeof snapshotCounts>>;
  let secondRunCounts: Awaited<ReturnType<typeof snapshotCounts>>;

  beforeAll(async () => {
    // PIC-37: refuse to TRUNCATE against any DB whose URL doesn't contain `_test`.
    assertTestDb();

    // PIC-76 PROBE: STEP 0 — pre-truncate (capture state arriving in)
    await probeStep('STEP 0 — pre-truncate (test enters here)');

    // Clean slate: truncate every table the seed touches so earlier test
    // runs or manual inserts don't skew the counts.
    await prisma.$executeRaw`
      TRUNCATE TABLE
        project_assignments,
        user_roles,
        users,
        projects,
        entities,
        notification_templates,
        role_permissions,
        roles,
        permissions,
        status_dictionaries,
        app_settings,
        currencies,
        countries
      CASCADE
    `;

    // PIC-76 PROBE: STEP 1 — post-truncate (did CASCADE clear everything?)
    await probeStep('STEP 1 — post-truncate (pre-first-runFullSeed)');

    // --- First seed run ---
    await runFullSeed();

    // PIC-76 PROBE: STEP 2 — post-first-runFullSeed (pre-first-snapshot)
    await probeStep('STEP 2 — post-first-runFullSeed (pre-first-snapshot)');

    firstRunCounts = await snapshotCounts();

    // PIC-76 PROBE: STEP 3 — post-first-snapshot (pre-second-runFullSeed)
    await probeStep('STEP 3 — post-first-snapshot (pre-second-runFullSeed)');

    // --- Second seed run (must be identical) ---
    await runFullSeed();

    // PIC-76 PROBE: STEP 4 — post-second-runFullSeed (pre-second-snapshot)
    await probeStep('STEP 4 — post-second-runFullSeed (pre-second-snapshot)');

    secondRunCounts = await snapshotCounts();

    // PIC-76 PROBE: STEP 5 — post-second-snapshot (assertion-time)
    await probeStep('STEP 5 — post-second-snapshot (assertion-time)');
  }, 60_000); // generous timeout for two full seed runs

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('produces identical row counts across all seeded tables', () => {
    expect(secondRunCounts).toStrictEqual(firstRunCounts);
  });

  it('has non-zero counts in every seeded table', () => {
    for (const [table, count] of Object.entries(firstRunCounts)) {
      expect(count, `${table} should have > 0 rows after seed`).toBeGreaterThan(0);
    }
  });

  it('master_admin user has exactly 1 user_role (not 2)', async () => {
    const admin = await prisma.user.findUnique({
      where: { email: 'ahmedafd90@gmail.com' },
    });
    expect(admin).not.toBeNull();

    const roleCount = await prisma.userRole.count({
      where: { userId: admin!.id },
    });
    expect(roleCount).toBe(1);
  });

  it('master_admin has exactly one assignment per demo project (no duplicates after repeated seed runs)', async () => {
    const admin = await prisma.user.findUnique({
      where: { email: 'ahmedafd90@gmail.com' },
    });
    expect(admin).not.toBeNull();

    // master-admin.ts fans the admin out across every demo project
    // (DEMO_PROJECT_CODES). Repeated seed runs must not create more than
    // one (admin, project) assignment per project, regardless of how
    // many projects the demo fixture grows to.
    const assignments = await prisma.projectAssignment.findMany({
      where: { userId: admin!.id },
      select: { projectId: true },
    });
    const uniqueProjectIds = new Set(assignments.map((a) => a.projectId));
    expect(assignments.length).toBe(uniqueProjectIds.size);
    expect(assignments.length).toBeGreaterThan(0);
  });
});
