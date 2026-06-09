/**
 * PIC-108-E (Phase MT) — posting + audit + import write-path orgId-supply,
 * RED→GREEN on a REAL 2nd org. THE FINANCIAL-LEDGER BATCH (append-only tables).
 *
 * Proves each ledger/import create attributes the record to its project's org
 * (SECOND_ORG_ID), NOT the singleton @default. The 6 org-B delta sites here:
 *   - postingEvent (postingService.post — site 1)        → resolveProjectOrgId
 *   - auditLog     (the post's threaded audit — site 3)  → Option A′ (entry.orgId)
 *   - postingEvent (reversePostingEvent — site 2)        → original.orgId (parent in hand)
 *   - ipaForecast  (commitIpaForecastRow — site 6)       → resolveProjectOrgId
 *   - ipa          (commitIpaHistoryRow — site 7)        → resolveProjectOrgId
 *   - projectBudget(commitBudgetBaselineRow — site 5)    → resolveProjectOrgId
 *
 * Sites NOT exercised here but proven by the static write-scope-guard:
 *   - overrideLog (site 4): platform-level → orgId = auditEntry.orgId = SINGLETON
 *     by design (no org-B delta; guard proves the static supply).
 *   - importBatch (site 8, stageBatch): needs a real xlsx buffer; guard-covered.
 *   - the failed-event postingEvent (site 1 second create): shares the same
 *     resolved `orgId` var as the posted-event create; guard-covered.
 *
 * RED→GREEN: GREEN here; the RED is the stash-revert proof — stash the source
 * edits → all 6 fall to the singleton …0001 (the live tenant-#2 mis-attribution
 * on an APPEND-ONLY ledger, which is unfixable in prod) → restore.
 *
 * Teardown uses raw-SQL DELETE on the append-only tables (posting_events,
 * audit_logs) — the Prisma client blocks delete on them (no-delete-on-immutable).
 *
 * DB-backed (real fmksa_test_core) → runs in the CI @fmksa/core Test job.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '@fmksa/db';
import {
  ensureSecondOrg,
  createTenantContext,
  cleanupTenantContext,
  SECOND_ORG_ID,
  type TenantContext,
} from '../helpers/second-org';
import { postingService } from '../../src/posting/service';
import { reversePostingEvent } from '../../src/posting/reversal';
import { commitIpaForecastRow } from '../../src/import/committers/ipa-forecast';
import { commitIpaHistoryRow } from '../../src/import/committers/ipa-history';
import { commitBudgetBaselineRow } from '../../src/import/committers/budget-baseline';
import type { Prisma } from '@fmksa/db';

const TAG = `p108e-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
let ctx: TenantContext;
let postedEventId: string; // shared: post → audit → reversal

beforeAll(async () => {
  await ensureSecondOrg();
  ctx = await createTenantContext(SECOND_ORG_ID, TAG);
}, 60_000);

afterAll(async () => {
  const { projectId, userId } = ctx;
  // Append-only tables: the Prisma client blocks delete (no-delete-on-immutable),
  // so tear down via raw SQL (the earlier-batch pattern).
  await prisma.$executeRawUnsafe(
    `DELETE FROM posting_exceptions WHERE event_id IN (SELECT id FROM posting_events WHERE project_id = $1)`,
    projectId,
  );
  await prisma.$executeRawUnsafe(`DELETE FROM posting_events WHERE project_id = $1`, projectId);
  await prisma.$executeRawUnsafe(
    `DELETE FROM audit_logs WHERE project_id = $1 OR actor_user_id = $2`,
    projectId,
    userId,
  );
  // Mutable children — Prisma deleteMany (FK order: children before parent).
  await prisma.budgetAdjustment.deleteMany({ where: { budget: { projectId } } });
  await prisma.budgetLine.deleteMany({ where: { budget: { projectId } } });
  await prisma.projectBudget.deleteMany({ where: { projectId } });
  await prisma.ipaForecast.deleteMany({ where: { projectId } });
  await prisma.ipa.deleteMany({ where: { projectId } });
  await cleanupTenantContext(ctx);
}, 60_000);

describe('PIC-108-E — posting/audit/import writes attribute orgId (real 2nd org)', () => {
  it('postingEvent (post) → orgId is org-B (not the singleton)', async () => {
    const event = await postingService.post({
      eventType: 'TEST_EVENT_M1',
      sourceService: 'test-service',
      sourceRecordType: 'test_record',
      sourceRecordId: `rec-108e-${TAG}`,
      projectId: ctx.projectId,
      idempotencyKey: `108e-${TAG}`,
      payload: { amount: 500, currency: 'SAR', description: '108e' },
      actorUserId: ctx.userId,
    });
    postedEventId = event.id;
    expect(event.orgId).toBe(SECOND_ORG_ID);
  });

  it('auditLog (threaded from post, Option A′) → orgId is org-B', async () => {
    const audit = await prisma.auditLog.findFirstOrThrow({
      where: { resourceId: postedEventId, action: 'posting_event_posted' },
    });
    expect(audit.orgId).toBe(SECOND_ORG_ID);
  });

  it('postingEvent (reversal) → orgId is org-B (= the reversed event’s org)', async () => {
    const { reversalEvent } = await reversePostingEvent({
      originalEventId: postedEventId,
      reason: '108e reversal',
      actorUserId: ctx.userId,
    });
    expect(reversalEvent.orgId).toBe(SECOND_ORG_ID);
  });

  it('ipaForecast (commitIpaForecastRow) → orgId is org-B', async () => {
    const result = await prisma.$transaction((tx) =>
      commitIpaForecastRow(
        tx as unknown as Prisma.TransactionClient,
        {
          projectId: ctx.projectId,
          projectCurrency: 'SAR',
          batchId: `batch-${TAG}`,
          importRowId: `row-${TAG}-f`,
          rowNumber: 2,
          actorUserId: ctx.userId,
        },
        { periodNumber: 1, periodStart: '2026-01-01', forecastAmount: '1000', notes: null },
      ),
    );
    if (result.status !== 'committed') throw new Error(`expected committed, got ${result.status}`);
    const forecast = await prisma.ipaForecast.findUniqueOrThrow({
      where: { id: result.committedRecordId },
    });
    expect(forecast.orgId).toBe(SECOND_ORG_ID);
  });

  it('ipa (commitIpaHistoryRow) → orgId is org-B', async () => {
    const result = await commitIpaHistoryRow(
      prisma as unknown as Prisma.TransactionClient,
      {
        projectId: ctx.projectId,
        entityId: null,
        batchId: `batch-${TAG}`,
        importRowId: `row-${TAG}-h`,
        rowNumber: 2,
        actorUserId: ctx.userId,
      },
      {
        periodNumber: 1,
        periodFrom: '2026-01-01',
        periodTo: '2026-01-31',
        grossAmount: '10000',
        retentionRate: '0.10', // rate column is Decimal(5,4) — a fraction (10%), not a percent
        retentionAmount: '1000',
        previousCertified: '0',
        currentClaim: '10000',
        advanceRecovery: null,
        otherDeductions: null,
        netClaimed: '9000',
        currency: 'SAR',
        status: 'draft', // non-posting status → skips the posting branch (focus on ipa.create)
        approvedAt: null,
        signedAt: null,
        issuedAt: null,
        description: '108e ipa',
      },
      prisma as unknown as Parameters<typeof commitIpaHistoryRow>[3],
    );
    if (result.status !== 'committed') throw new Error(`expected committed, got ${result.status}`);
    const ipa = await prisma.ipa.findUniqueOrThrow({ where: { id: result.committedRecordId } });
    expect(ipa.orgId).toBe(SECOND_ORG_ID);
  });

  it('projectBudget (commitBudgetBaselineRow bootstrap) → orgId is org-B', async () => {
    const result = await prisma.$transaction((tx) =>
      commitBudgetBaselineRow(
        tx as unknown as Prisma.TransactionClient,
        {
          projectId: ctx.projectId,
          batchId: `batch-${TAG}`,
          importRowId: `row-${TAG}-b`,
          rowNumber: 2,
          actorUserId: ctx.userId,
        },
        { categoryCode: 'materials', budgetAmount: '5000' },
      ),
    );
    expect(result.status).toBe('committed');
    const budget = await prisma.projectBudget.findUniqueOrThrow({
      where: { projectId: ctx.projectId },
    });
    expect(budget.orgId).toBe(SECOND_ORG_ID);
  });
});
