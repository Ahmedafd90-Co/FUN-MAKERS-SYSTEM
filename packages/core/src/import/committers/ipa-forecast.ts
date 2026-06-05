/**
 * IPA forecast committer — PIC-99 PR-1 (M1).
 *
 * For each valid ImportRow:
 *   - Create an IpaForecast row bound to ctx.projectId, with periodNumber,
 *     periodStart, forecastAmount, optional notes.
 *   - Inherit currency from ctx.projectCurrency (resolved by the orchestrator
 *     at commit time, not by the validator — forecasts inherit project currency).
 *   - Stamp createdBy = actor.
 *   - Emit an audit entry with action `import.commit.ipa_forecast`.
 *   - Return 'committed' with `committedRecordType` = 'ipa_forecast'.
 *
 * Forecast commit does NOT emit a posting event — forecasts are planning data,
 * not ledger truth. PR-2 cost-sheet aggregation reads the active set; ledger
 * stays untouched.
 *
 * Scope binding:
 *   - ctx.projectId comes from the validated batch (commitBatch already
 *     called assertProjectScope on the batch). No by-id read in this committer,
 *     so no assertProjectScope needed locally per the PIC-71 PR-2 guard
 *     (validator has no DB access; committer only writes via .create).
 *   - If a P2002 unique-constraint race slips through (e.g., two batches commit
 *     the same period concurrently), the row is flipped to 'invalid' with a
 *     clear error so the operator can re-validate.
 */

import type { Prisma } from '@fmksa/db';
import type { ImportIssue, ParsedIpaForecastRow, RowCommitResult } from '../types';
import { auditService } from '../../audit/service';

type Tx = Prisma.TransactionClient;

export async function commitIpaForecastRow(
  tx: Tx,
  ctx: {
    projectId: string;
    projectCurrency: string;
    batchId: string;
    importRowId: string;
    rowNumber: number;
    actorUserId: string;
  },
  parsed: ParsedIpaForecastRow,
): Promise<RowCommitResult> {
  const errors: ImportIssue[] = [];

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const created = await (tx as any).ipaForecast.create({
      data: {
        projectId: ctx.projectId,
        periodNumber: parsed.periodNumber,
        periodStart: new Date(parsed.periodStart),
        forecastAmount: parsed.forecastAmount,
        currency: ctx.projectCurrency,
        notes: parsed.notes,
        createdBy: ctx.actorUserId,
      },
    });

    await auditService.log(
      {
        actorUserId: ctx.actorUserId,
        actorSource: 'user',
        action: 'import.commit.ipa_forecast',
        resourceType: 'ipa_forecast',
        resourceId: created.id,
        projectId: ctx.projectId,
        beforeJson: null,
        afterJson: {
          periodNumber: parsed.periodNumber,
          periodStart: parsed.periodStart,
          forecastAmount: parsed.forecastAmount,
          importBatchId: ctx.batchId,
          importRowId: ctx.importRowId,
        },
      },
      tx as Prisma.TransactionClient,
    );

    return {
      rowNumber: ctx.rowNumber,
      status: 'committed',
      committedRecordType: 'ipa_forecast',
      committedRecordId: created.id,
    };
  } catch (err) {
    // Prisma P2002 — unique constraint violation on (orgId, projectId, periodNumber).
    if (err instanceof Error && 'code' in err && (err as { code: string }).code === 'P2002') {
      errors.push({
        code: 'period_number_collision',
        field: 'period_number',
        message: `An active IpaForecast already exists for period ${parsed.periodNumber} on this project.`,
      });
      return {
        rowNumber: ctx.rowNumber,
        status: 'invalid',
        errors,
      };
    }
    throw err;
  }
}
