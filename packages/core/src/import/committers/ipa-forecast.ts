/**
 * IPA forecast committer.
 *
 * For each valid ImportRow:
 *   - Create an IpaForecast record bound to this project, periodNumber,
 *     periodStart, forecastAmount and optional notes.
 *   - Stamp createdBy = actor and record an audit entry.
 *   - Return 'committed' with `committedRecordType` = 'ipa_forecast'.
 *
 * Unlike IPA history, forecast commit does NOT emit a posting event —
 * forecasts are a plan of record for the commercial dashboard, not ledger
 * truth. They're tracked and reconciled separately.
 *
 * The (projectId, periodNumber) uniqueness on IpaForecast is enforced by
 * the schema. Validation surfaces any duplicate as a conflict so the
 * operator can resolve it before commit; if a race causes a duplicate to
 * slip through, Prisma throws P2002 and we map that to 'invalid'.
 */

import type { Prisma } from '@fmksa/db';
import type { ImportIssue, ParsedIpaForecastRow, RowCommitResult } from '../types';
import { auditService } from '../../audit/service';

type Tx = Prisma.TransactionClient;

export async function commitIpaForecastRow(
  tx: Tx,
  ctx: {
    projectId: string;
    batchId: string;
    importRowId: string;
    rowNumber: number;
    actorUserId: string;
  },
  parsed: ParsedIpaForecastRow,
): Promise<RowCommitResult> {
  const errors: ImportIssue[] = [];

  try {
    const created = await (tx as any).ipaForecast.create({
      data: {
        projectId: ctx.projectId,
        periodNumber: parsed.periodNumber,
        periodStart: new Date(parsed.periodStart),
        forecastAmount: parsed.forecastAmount,
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
    // Prisma P2002 — unique constraint violation on (projectId, periodNumber).
    if (err instanceof Error && 'code' in err && (err as any).code === 'P2002') {
      errors.push({
        code: 'forecast_period_number_duplicate',
        field: 'period_number',
        message: `A forecast for periodNumber=${parsed.periodNumber} already exists on this project. Validation missed this — re-validate the batch.`,
      });
      return { rowNumber: ctx.rowNumber, status: 'invalid', errors };
    }
    // Anything else bubbles up to the batch commit handler.
    throw err;
  }
}
