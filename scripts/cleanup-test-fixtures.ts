/**
 * One-off cleanup: remove vitest fixtures that leaked into the shared
 * dev DB and surface on operator-facing admin pages.
 *
 * Context (2026-04-21): the vitest suite runs against `fmksa_dev` (the
 * same DB the dev UI uses). Several tests create rows with stable test
 * markers and don't clean up robustly:
 *
 *   WorkflowTemplate.recordType = 'test_record'         (audit/coverage.test.ts, workflow/*.test.ts)
 *   PostingEvent.eventType      = 'TEST_EVENT_M1'       (posting/*.test.ts)
 *   PostingEvent.sourceRecordType = 'test_record'       (posting/*.test.ts)
 *
 * The admin routers were updated to default-exclude these fixtures from
 * operator surfaces. This script removes the already-leaked rows where
 * deletion is permitted.
 *
 * What gets deleted:
 *   ✓ PostingException rows whose event has TEST_EVENT_M1 / test_record.
 *   ✓ WorkflowTemplate rows with recordType='test_record' (+ cascade steps).
 *
 * What stays (by design):
 *   ✗ PostingEvent is append-only ledger, enforced by the
 *     no-delete-on-immutable Prisma middleware. Orphaned test events stay
 *     in the ledger but no longer surface anywhere because:
 *       - the admin posting-exceptions list is filtered by default, and
 *       - there was never an admin listing of raw PostingEvent on its own.
 *     They are cosmetically present in the ledger, operationally invisible.
 *
 * Not touched (out of scope for this lane):
 *   • Test Project / User / Role rows. They're referenced by other tests
 *     and by historic audit trails; deletion risks ripple failures. With
 *     Project Assignments hidden (Step 4), they no longer surface.
 *
 * Safety:
 *   - Only deletes rows matching the documented test markers verbatim.
 *   - Re-runnable — zero deletes on an already-clean DB.
 *   - Reports before/after counts.
 *
 * Usage:
 *   DATABASE_URL="postgresql://..." npx tsx scripts/cleanup-test-fixtures.ts
 */
import { prisma } from '@fmksa/db';

const TEST_EVENT_TYPES = ['TEST_EVENT_M1'] as const;
const TEST_SOURCE_RECORD_TYPES = ['test_record'] as const;

async function main() {
  console.log('--- Test-fixture cleanup ---');

  // ─── Before counts ──────────────────────────────────────────────
  const before = {
    wfTemplates: await prisma.workflowTemplate.count({
      where: { recordType: 'test_record' },
    }),
    postingExceptions: await prisma.postingException.count({
      where: {
        event: {
          OR: [
            { eventType: { in: TEST_EVENT_TYPES as unknown as string[] } },
            {
              sourceRecordType: {
                in: TEST_SOURCE_RECORD_TYPES as unknown as string[],
              },
            },
          ],
        },
      },
    }),
    postingEvents: await prisma.postingEvent.count({
      where: {
        OR: [
          { eventType: { in: TEST_EVENT_TYPES as unknown as string[] } },
          {
            sourceRecordType: {
              in: TEST_SOURCE_RECORD_TYPES as unknown as string[],
            },
          },
        ],
      },
    }),
  };

  console.log('Before:');
  console.log(`  WorkflowTemplate (recordType=test_record):            ${before.wfTemplates}`);
  console.log(`  PostingException (event TEST_EVENT_M1 / test_record): ${before.postingExceptions}`);
  console.log(`  PostingEvent     (TEST_EVENT_M1 / test_record):       ${before.postingEvents}`);

  // ─── Deletes (exception + template; events stay — see header) ────
  const delExceptions = await prisma.postingException.deleteMany({
    where: {
      event: {
        OR: [
          { eventType: { in: TEST_EVENT_TYPES as unknown as string[] } },
          {
            sourceRecordType: {
              in: TEST_SOURCE_RECORD_TYPES as unknown as string[],
            },
          },
        ],
      },
    },
  });

  // WorkflowTemplates have a FK chain: workflow_actions → workflow_steps
  // → workflow_templates, PLUS workflow_instances reference templates.
  // None of these relationships have ON DELETE CASCADE. Cleanly removing
  // test templates would require either adding cascades (schema change,
  // out of scope) or unwinding every descendant of every instance (risky).
  //
  // We chose Path A instead: deactivate the templates. The admin router
  // already defaults to excluding recordType='test_record', so the UI is
  // defended regardless. Deactivation is belt-and-suspenders so these
  // templates can never be picked up as active defaults for new
  // instances.
  const deactivated = await prisma.workflowTemplate.updateMany({
    where: { recordType: 'test_record', isActive: true },
    data: { isActive: false },
  });

  console.log('\nUpdated:');
  console.log(`  PostingException    deleted:      ${delExceptions.count}`);
  console.log(`  WorkflowTemplate    deactivated:  ${deactivated.count}  (FK chain too deep to delete safely; router defaults exclude them)`);
  console.log(`  PostingEvent        untouched:    0  (append-only ledger; orphan test events remain but do not surface)`);

  // ─── After counts ────────────────────────────────────────────────
  const after = {
    wfTemplates: await prisma.workflowTemplate.count({
      where: { recordType: 'test_record', isActive: true },
    }),
    postingExceptions: await prisma.postingException.count({
      where: {
        event: {
          OR: [
            { eventType: { in: TEST_EVENT_TYPES as unknown as string[] } },
            {
              sourceRecordType: {
                in: TEST_SOURCE_RECORD_TYPES as unknown as string[],
              },
            },
          ],
        },
      },
    }),
    postingEvents: await prisma.postingEvent.count({
      where: {
        OR: [
          { eventType: { in: TEST_EVENT_TYPES as unknown as string[] } },
          {
            sourceRecordType: {
              in: TEST_SOURCE_RECORD_TYPES as unknown as string[],
            },
          },
        ],
      },
    }),
  };

  console.log('\nAfter:');
  console.log(`  WorkflowTemplate (active test_record):                ${after.wfTemplates}`);
  console.log(`  PostingException (event TEST_EVENT_M1 / test_record): ${after.postingExceptions}`);
  console.log(`  PostingEvent     (TEST_EVENT_M1 / test_record):       ${after.postingEvents}`);

  // Success = exceptions and templates at 0. PostingEvent is allowed to
  // remain non-zero (immutable ledger).
  const surfacesClean =
    after.wfTemplates === 0 && after.postingExceptions === 0;
  console.log(
    surfacesClean
      ? '\n✓ Operator surfaces clean. Admin pages will no longer show leaked test fixtures.'
      : '\n⚠ Some operator-surfacing fixtures remain — check router defaults and re-run.',
  );
  if (after.postingEvents > 0) {
    console.log(
      `  (${after.postingEvents} orphan test PostingEvent(s) remain in the append-only ledger — operationally invisible.)`,
    );
  }

  await prisma.$disconnect();
  if (!surfacesClean) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
