/**
 * IPA history committer.
 *
 * For each valid ImportRow in a batch:
 *   1. Insert a new Ipa row with origin=imported_historical, stamping the
 *      import provenance fields and freezing the parsed sheet values into
 *      importedOriginalJson.
 *   2. If the row's declared status maps to a real IPA lifecycle state,
 *      set that status directly (no workflow). Do NOT default to 'closed'.
 *   3. If the row's declared status is at or beyond approved_internal,
 *      emit ONE IPA_APPROVED posting event with:
 *        - origin = imported_historical
 *        - importBatchId
 *        - idempotencyKey namespaced as `ipa-approved-imported-{id}`
 *        - postedAt picked by priority chain: approvedAt > signedAt >
 *          issuedAt > periodTo. The chosen source is recorded on the
 *          event's payload under _import.postingDateSource.
 *   4. Mark the ImportRow committed with committedRecordType = 'ipa'.
 *
 * Live workflow is never started for imported IPAs. Status is frozen at
 * import; post-commit changes flow through adjustIpa() instead.
 */

import type { Prisma, PrismaClient, IpaStatus } from '@fmksa/db';
import type { ImportIssue, ParsedIpaHistoryRow, RowCommitResult } from '../types';
import { auditService } from '../../audit/service';
import { postingService } from '../../posting/service';

type Tx = Prisma.TransactionClient;

function pickPostedAt(parsed: ParsedIpaHistoryRow): {
  postedAt: Date;
  source: 'approvedAt' | 'signedAt' | 'issuedAt' | 'periodTo';
} {
  if (parsed.approvedAt) return { postedAt: new Date(parsed.approvedAt), source: 'approvedAt' };
  if (parsed.signedAt) return { postedAt: new Date(parsed.signedAt), source: 'signedAt' };
  if (parsed.issuedAt) return { postedAt: new Date(parsed.issuedAt), source: 'issuedAt' };
  return { postedAt: new Date(parsed.periodTo), source: 'periodTo' };
}

const POSTING_STATUSES = new Set([
  'approved_internal',
  'signed',
  'issued',
  'superseded',
  'closed',
]);

export async function commitIpaHistoryRow(
  _tx: Tx, // nested posting service manages its own transaction
  ctx: {
    projectId: string;
    entityId: string | null;
    batchId: string;
    importRowId: string;
    rowNumber: number;
    actorUserId: string;
  },
  parsed: ParsedIpaHistoryRow,
  prisma: PrismaClient,
): Promise<RowCommitResult> {
  const errors: ImportIssue[] = [];

  // Defensive: re-check period-number collision at commit time (race window
  // between validate and commit). If it's colliding now, return invalid —
  // the UI will show the batch as partially_valid.
  const existing = await prisma.ipa.findUnique({
    where: {
      projectId_periodNumber: {
        projectId: ctx.projectId,
        periodNumber: parsed.periodNumber,
      },
    },
  });
  if (existing) {
    errors.push({
      code: 'period_number_race_conflict',
      field: 'period_number',
      message: `Period ${parsed.periodNumber} was added/imported by someone else since validation.`,
    });
    return { rowNumber: ctx.rowNumber, status: 'invalid', errors };
  }

  const { postedAt, source: postingDateSource } = pickPostedAt(parsed);

  // Create the IPA record (origin=imported_historical).
  const ipa = await prisma.ipa.create({
    data: {
      projectId: ctx.projectId,
      status: parsed.status as IpaStatus,
      periodNumber: parsed.periodNumber,
      periodFrom: new Date(parsed.periodFrom),
      periodTo: new Date(parsed.periodTo),
      grossAmount: parsed.grossAmount,
      retentionRate: parsed.retentionRate,
      retentionAmount: parsed.retentionAmount,
      previousCertified: parsed.previousCertified,
      currentClaim: parsed.currentClaim,
      advanceRecovery: parsed.advanceRecovery,
      otherDeductions: parsed.otherDeductions,
      netClaimed: parsed.netClaimed,
      currency: parsed.currency,
      description: parsed.description,
      createdBy: ctx.actorUserId,
      origin: 'imported_historical',
      importBatchId: ctx.batchId,
      importRowId: ctx.importRowId,
      importedOriginalJson: parsed as unknown as Prisma.InputJsonValue,
      importedByUserId: ctx.actorUserId,
      importedAt: new Date(),
    },
  });

  await auditService.log({
    actorUserId: ctx.actorUserId,
    actorSource: 'user',
    action: 'import.commit.ipa',
    resourceType: 'ipa',
    resourceId: ipa.id,
    projectId: ctx.projectId,
    beforeJson: null,
    afterJson: {
      id: ipa.id,
      origin: 'imported_historical',
      status: ipa.status,
      periodNumber: ipa.periodNumber,
      importBatchId: ctx.batchId,
      importRowId: ctx.importRowId,
    },
  });

  if (POSTING_STATUSES.has(parsed.status)) {
    await postingService.post({
      eventType: 'IPA_APPROVED',
      sourceService: 'commercial',
      sourceRecordType: 'ipa',
      sourceRecordId: ipa.id,
      projectId: ctx.projectId,
      ...(ctx.entityId ? { entityId: ctx.entityId } : {}),
      idempotencyKey: `ipa-approved-imported-${ipa.id}`,
      origin: 'imported_historical',
      importBatchId: ctx.batchId,
      postedAtOverride: postedAt,
      payload: {
        ipaId: ipa.id,
        periodNumber: ipa.periodNumber,
        grossAmount: ipa.grossAmount.toString(),
        retentionAmount: ipa.retentionAmount.toString(),
        netClaimed: ipa.netClaimed.toString(),
        currency: ipa.currency,
        projectId: ipa.projectId,
        _import: {
          batchId: ctx.batchId,
          rowId: ctx.importRowId,
          rowNumber: ctx.rowNumber,
          postingDateSource,
        },
      },
      actorUserId: ctx.actorUserId,
    });
  }

  return {
    rowNumber: ctx.rowNumber,
    status: 'committed',
    committedRecordType: 'ipa',
    committedRecordId: ipa.id,
  };
}
