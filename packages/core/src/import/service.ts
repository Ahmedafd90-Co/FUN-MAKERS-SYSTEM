/**
 * Sheet-import service — orchestrator for the staging layer.
 *
 * Lifecycle of an ImportBatch:
 *
 *   stage      — file hash stored, raw rows parsed into ImportRow (pending).
 *                Live state is NEVER touched.
 *   validate   — per-row validators run against a reference-data snapshot.
 *                Each row becomes valid | invalid | conflict. Freshness
 *                fields stamped (parserVersion, validatorSchemaVersion,
 *                referenceDataSnapshotJson, sourceFileHashAtValidation).
 *                Batch ends as 'validated' (all rows valid) or
 *                'partially_valid' (any row invalid/conflict).
 *   commit     — refuses to run if freshness drifted (parser, schema,
 *                snapshot, or source hash). Iterates rows in a single
 *                transaction; each row calls its committer which writes
 *                to live tables + posts events. Row/batch status updated.
 *   reject     — marks batch rejected; live state untouched.
 *   cancel     — operator aborts a staged batch. Live state untouched.
 *
 * The service NEVER mutates live records outside of commit. Every
 * mutation here is on ImportBatch / ImportRow rows.
 */

import { prisma, Prisma, type ImportType, type ImportBatchStatus, type ImportRowStatus } from '@fmksa/db';
import { auditService } from '../audit/service';

import { PARSER_VERSIONS, VALIDATOR_SCHEMA_VERSIONS } from './versions';
import { parseXlsx } from './parse-sheet';
import { sha256Hex } from './hash';
import {
  buildReferenceSnapshot,
  describeSnapshotDrift,
  type ReferenceSnapshot,
  type BudgetReferenceSnapshot,
  type IpaReferenceSnapshot,
} from './reference-snapshot';
import { validateBudgetBaselineRow } from './validators/budget-baseline';
import { validateIpaHistoryRow } from './validators/ipa-history';
import { commitBudgetBaselineRow } from './committers/budget-baseline';
import { commitIpaHistoryRow } from './committers/ipa-history';
import type { ImportBatchSummary } from './types';

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export class DuplicateImportError extends Error {
  constructor(
    public existingBatchId: string,
    public sourceFileHash: string,
  ) {
    super(
      `Duplicate upload: a batch with this file hash already exists (${existingBatchId}).`,
    );
    this.name = 'DuplicateImportError';
  }
}

export class StaleValidationError extends Error {
  constructor(public details: string) {
    super(`Cannot commit — validation is stale. ${details}`);
    this.name = 'StaleValidationError';
  }
}

export class ImportBatchNotReadyError extends Error {
  constructor(public currentStatus: ImportBatchStatus, public requiredStatuses: ImportBatchStatus[]) {
    super(
      `Batch is in status '${currentStatus}', cannot perform this action. Required: [${requiredStatuses.join(', ')}].`,
    );
    this.name = 'ImportBatchNotReadyError';
  }
}

// ---------------------------------------------------------------------------
// Stage — upload + parse into ImportRow (pending)
// ---------------------------------------------------------------------------

export async function stageBatch(input: {
  projectId: string;
  importType: ImportType;
  sourceFileName: string;
  sourceStoragePath?: string | null;
  fileBytes: Buffer | Uint8Array;
  actorUserId: string;
}) {
  const sourceFileHash = sha256Hex(input.fileBytes);

  // Duplicate check — same hash + project + type is already staged
  const dupe = await prisma.importBatch.findUnique({
    where: {
      projectId_importType_sourceFileHash: {
        projectId: input.projectId,
        importType: input.importType,
        sourceFileHash,
      },
    },
  });
  if (dupe) {
    throw new DuplicateImportError(dupe.id, sourceFileHash);
  }

  const parsed = parseXlsx(input.fileBytes);
  if (parsed.rows.length === 0) {
    throw new Error('Sheet contains no data rows after the header.');
  }

  const summary: ImportBatchSummary = {
    totalRows: parsed.rows.length,
    pending: parsed.rows.length,
    valid: 0,
    invalid: 0,
    conflict: 0,
    committed: 0,
    skipped: 0,
  };

  const batch = await prisma.$transaction(async (tx) => {
    const created = await tx.importBatch.create({
      data: {
        projectId: input.projectId,
        importType: input.importType,
        sourceFileName: input.sourceFileName,
        sourceFileHash,
        sourceStoragePath: input.sourceStoragePath ?? null,
        uploadedBy: input.actorUserId,
        status: 'staged',
        summaryJson: summary as unknown as Prisma.InputJsonValue,
      },
    });

    await tx.importRow.createMany({
      data: parsed.rows.map((r, i) => ({
        batchId: created.id,
        rowNumber: i + 2, // +2 so operator sees spreadsheet-row numbering (header=row 1)
        rawJson: r as unknown as Prisma.InputJsonValue,
        status: 'pending' as ImportRowStatus,
      })),
    });

    await auditService.log(
      {
        actorUserId: input.actorUserId,
        actorSource: 'user',
        action: 'import.stage',
        resourceType: 'import_batch',
        resourceId: created.id,
        projectId: input.projectId,
        beforeJson: null,
        afterJson: {
          importType: input.importType,
          sourceFileName: input.sourceFileName,
          sourceFileHash,
          totalRows: parsed.rows.length,
        },
      },
      tx,
    );

    return created;
  });

  return { batchId: batch.id, totalRows: parsed.rows.length, sourceFileHash };
}

// ---------------------------------------------------------------------------
// Validate — run per-row validation against a snapshot
// ---------------------------------------------------------------------------

export async function validateBatch(batchId: string, actorUserId: string) {
  const batch = await prisma.importBatch.findUniqueOrThrow({
    where: { id: batchId },
    include: { rows: true },
  });

  if (batch.status === 'committed' || batch.status === 'rejected' || batch.status === 'cancelled') {
    throw new ImportBatchNotReadyError(batch.status, ['staged', 'validated', 'partially_valid']);
  }

  const snapshot = await buildReferenceSnapshot(batch.importType, batch.projectId);

  let projectCurrency = 'SAR';
  if (batch.importType === 'ipa_history') {
    const project = await prisma.project.findUniqueOrThrow({
      where: { id: batch.projectId },
      select: { currencyCode: true },
    });
    projectCurrency = project.currencyCode ?? 'SAR';
  }

  let validCount = 0;
  let invalidCount = 0;
  let conflictCount = 0;

  // Per-batch state the IPA validator needs for intra-batch duplicate detection.
  const seenPeriodNumbers = new Map<number, number>();

  await prisma.$transaction(async (tx) => {
    for (const row of batch.rows) {
      const raw = row.rawJson as Record<string, unknown>;
      let result;

      if (batch.importType === 'budget_baseline') {
        result = validateBudgetBaselineRow(
          row.rowNumber,
          raw,
          snapshot as BudgetReferenceSnapshot,
        );
      } else {
        result = validateIpaHistoryRow(
          row.rowNumber,
          raw,
          snapshot as IpaReferenceSnapshot,
          projectCurrency,
          seenPeriodNumbers,
        );
      }

      let status: ImportRowStatus = 'valid';
      if (result.errors.length > 0) {
        status = 'invalid';
        invalidCount++;
      } else if (result.conflict) {
        status = 'conflict';
        conflictCount++;
      } else {
        validCount++;
      }

      await tx.importRow.update({
        where: { id: row.id },
        data: {
          status,
          parsedJson: (result.parsedJson as unknown) as Prisma.InputJsonValue,
          validationErrorsJson: result.errors as unknown as Prisma.InputJsonValue,
          warningsJson: result.warnings as unknown as Prisma.InputJsonValue,
          conflictJson: result.conflict
            ? (result.conflict as unknown as Prisma.InputJsonValue)
            : Prisma.JsonNull,
        },
      });
    }

    const batchStatus: ImportBatchStatus =
      invalidCount === 0 && conflictCount === 0 ? 'validated' : 'partially_valid';

    const summary: ImportBatchSummary = {
      totalRows: batch.rows.length,
      pending: 0,
      valid: validCount,
      invalid: invalidCount,
      conflict: conflictCount,
      committed: 0,
      skipped: 0,
    };

    await tx.importBatch.update({
      where: { id: batch.id },
      data: {
        status: batchStatus,
        summaryJson: summary as unknown as Prisma.InputJsonValue,
        parserVersion: PARSER_VERSIONS[batch.importType] ?? null,
        validatorSchemaVersion: VALIDATOR_SCHEMA_VERSIONS[batch.importType] ?? null,
        referenceDataSnapshotJson: snapshot as unknown as Prisma.InputJsonValue,
        sourceFileHashAtValidation: batch.sourceFileHash,
        validationRanAt: new Date(),
      },
    });

    await auditService.log(
      {
        actorUserId,
        actorSource: 'user',
        action: 'import.validate',
        resourceType: 'import_batch',
        resourceId: batch.id,
        projectId: batch.projectId,
        beforeJson: { status: batch.status },
        afterJson: { status: batchStatus, summary } as any,
      },
      tx,
    );
  });

  return {
    batchId: batch.id,
    valid: validCount,
    invalid: invalidCount,
    conflict: conflictCount,
    total: batch.rows.length,
  };
}

// ---------------------------------------------------------------------------
// Exclude a row — operator decides not to commit a specific row
// ---------------------------------------------------------------------------

export async function excludeRow(rowId: string, actorUserId: string) {
  const row = await prisma.importRow.findUniqueOrThrow({
    where: { id: rowId },
    include: { batch: true },
  });
  if (row.status === 'committed') {
    throw new Error('Cannot exclude a row that has already been committed.');
  }
  const updated = await prisma.importRow.update({
    where: { id: rowId },
    data: {
      status: 'skipped' as ImportRowStatus,
      excludedByUserId: actorUserId,
      excludedAt: new Date(),
    },
  });
  await auditService.log({
    actorUserId,
    actorSource: 'user',
    action: 'import.exclude_row',
    resourceType: 'import_row',
    resourceId: rowId,
    projectId: row.batch.projectId,
    beforeJson: { status: row.status },
    afterJson: { status: updated.status, excludedByUserId: actorUserId },
  });
  return updated;
}

// ---------------------------------------------------------------------------
// Commit — promote valid rows into live state (with freshness guard)
// ---------------------------------------------------------------------------

export async function commitBatch(batchId: string, actorUserId: string) {
  const batch = await prisma.importBatch.findUniqueOrThrow({
    where: { id: batchId },
    include: {
      rows: {
        where: { status: 'valid' },
        orderBy: { rowNumber: 'asc' },
      },
      project: { select: { entityId: true } },
    },
  });

  if (batch.status !== 'validated' && batch.status !== 'partially_valid') {
    throw new ImportBatchNotReadyError(batch.status, ['validated', 'partially_valid']);
  }

  // Freshness guard — refuse if any of these drifted since validation.
  const currentParserVersion = PARSER_VERSIONS[batch.importType];
  const currentValidatorSchemaVersion = VALIDATOR_SCHEMA_VERSIONS[batch.importType];
  if (batch.parserVersion !== currentParserVersion) {
    throw new StaleValidationError(
      `Parser version drifted: ${batch.parserVersion} → ${currentParserVersion}. Re-validate this batch.`,
    );
  }
  if (batch.validatorSchemaVersion !== currentValidatorSchemaVersion) {
    throw new StaleValidationError(
      `Validator schema drifted: ${batch.validatorSchemaVersion} → ${currentValidatorSchemaVersion}. Re-validate this batch.`,
    );
  }
  if (batch.sourceFileHashAtValidation !== batch.sourceFileHash) {
    throw new StaleValidationError(
      'Source file hash at validation does not match current file hash (file changed). Re-upload or re-validate.',
    );
  }
  const currentSnapshot = await buildReferenceSnapshot(batch.importType, batch.projectId);
  const drift = describeSnapshotDrift(
    batch.referenceDataSnapshotJson as unknown as ReferenceSnapshot,
    currentSnapshot,
  );
  if (drift) {
    throw new StaleValidationError(drift);
  }

  if (batch.rows.length === 0) {
    throw new Error('Nothing to commit — no rows have status=valid.');
  }

  const committedRowIds: string[] = [];
  const newlyInvalidRowIds: Array<{ rowId: string; errors: unknown }> = [];

  // Each row runs through its committer. We keep commit as a single
  // transaction per row (committers themselves may nest their own tx via
  // postingService) rather than one giant batch-level transaction — this
  // allows the operator to see partial success if a rare race slips through.
  // Because every committer starts from `status=valid`, a mid-batch
  // failure never silently skips rows: the row is flipped to invalid with
  // the failing errors, surfaced in the review queue, and the batch ends
  // as partially_valid until the operator re-validates.
  for (const row of batch.rows) {
    if (!row.parsedJson) {
      newlyInvalidRowIds.push({
        rowId: row.id,
        errors: [{ code: 'parsed_json_missing', message: 'Parsed JSON missing at commit.' }],
      });
      continue;
    }

    try {
      const result = await prisma.$transaction(async (tx) => {
        if (batch.importType === 'budget_baseline') {
          return await commitBudgetBaselineRow(
            tx as unknown as Prisma.TransactionClient,
            {
              projectId: batch.projectId,
              batchId: batch.id,
              importRowId: row.id,
              rowNumber: row.rowNumber,
              actorUserId,
            },
            row.parsedJson as any,
          );
        } else {
          return await commitIpaHistoryRow(
            tx as unknown as Prisma.TransactionClient,
            {
              projectId: batch.projectId,
              entityId: batch.project.entityId ?? null,
              batchId: batch.id,
              importRowId: row.id,
              rowNumber: row.rowNumber,
              actorUserId,
            },
            row.parsedJson as any,
            prisma as unknown as Parameters<typeof commitIpaHistoryRow>[3],
          );
        }
      });

      if (result.status === 'committed') {
        await prisma.importRow.update({
          where: { id: row.id },
          data: {
            status: 'committed',
            committedRecordType: result.committedRecordType,
            committedRecordId: result.committedRecordId,
          },
        });
        committedRowIds.push(row.id);
      } else if (result.status === 'invalid') {
        await prisma.importRow.update({
          where: { id: row.id },
          data: {
            status: 'invalid',
            validationErrorsJson: result.errors as unknown as Prisma.InputJsonValue,
          },
        });
        newlyInvalidRowIds.push({ rowId: row.id, errors: result.errors });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await prisma.importRow.update({
        where: { id: row.id },
        data: {
          status: 'invalid',
          validationErrorsJson: [
            { code: 'commit_error', field: null, message },
          ] as unknown as Prisma.InputJsonValue,
        },
      });
      newlyInvalidRowIds.push({ rowId: row.id, errors: message });
    }
  }

  // Re-count rows for the final summary
  const [rowCounts, allRowsCount] = await Promise.all([
    prisma.importRow.groupBy({
      by: ['status'],
      where: { batchId: batch.id },
      _count: { _all: true },
    }),
    prisma.importRow.count({ where: { batchId: batch.id } }),
  ]);

  const counts: Record<ImportRowStatus, number> = {
    pending: 0,
    valid: 0,
    invalid: 0,
    conflict: 0,
    committed: 0,
    skipped: 0,
  };
  for (const rc of rowCounts) {
    counts[rc.status] = rc._count._all;
  }

  const pendingCount = counts.pending ?? 0;
  const validCount2 = counts.valid ?? 0;
  const invalidCount2 = counts.invalid ?? 0;
  const conflictCount2 = counts.conflict ?? 0;
  const committedCount = counts.committed ?? 0;
  const skippedCount = counts.skipped ?? 0;

  const summary: ImportBatchSummary = {
    totalRows: allRowsCount,
    pending: pendingCount,
    valid: validCount2,
    invalid: invalidCount2,
    conflict: conflictCount2,
    committed: committedCount,
    skipped: skippedCount,
  };

  // Batch status after commit:
  //   - every non-skipped row is committed → 'committed'
  //   - some remain in invalid/conflict → 'partially_valid'
  //   - nothing committed at all (shouldn't happen here, but defensively) →
  //     'partially_valid'
  const uncommittedRemaining =
    validCount2 + invalidCount2 + conflictCount2 + pendingCount;
  const finalStatus: ImportBatchStatus =
    uncommittedRemaining === 0 && committedCount > 0
      ? 'committed'
      : 'partially_valid';

  await prisma.$transaction(async (tx) => {
    await tx.importBatch.update({
      where: { id: batch.id },
      data: {
        status: finalStatus,
        summaryJson: summary as unknown as Prisma.InputJsonValue,
        committedAt: new Date(),
        committedBy: actorUserId,
      },
    });

    await auditService.log(
      {
        actorUserId,
        actorSource: 'user',
        action: 'import.commit',
        resourceType: 'import_batch',
        resourceId: batch.id,
        projectId: batch.projectId,
        beforeJson: { status: batch.status },
        afterJson: {
          status: finalStatus,
          committed: committedCount,
          newlyInvalid: newlyInvalidRowIds.length,
        },
      },
      tx,
    );
  });

  return {
    batchId: batch.id,
    committed: committedCount,
    newlyInvalid: newlyInvalidRowIds.length,
    finalStatus,
    summary,
  };
}

// ---------------------------------------------------------------------------
// Reject — permanent: operator rejects a batch entirely, live untouched
// ---------------------------------------------------------------------------

export async function rejectBatch(
  batchId: string,
  input: { reason: string },
  actorUserId: string,
) {
  const batch = await prisma.importBatch.findUniqueOrThrow({
    where: { id: batchId },
  });
  if (batch.status === 'committed' || batch.status === 'rejected' || batch.status === 'cancelled') {
    throw new ImportBatchNotReadyError(batch.status, ['staged', 'validated', 'partially_valid']);
  }
  await prisma.$transaction(async (tx) => {
    await tx.importBatch.update({
      where: { id: batchId },
      data: {
        status: 'rejected',
        rejectedAt: new Date(),
        rejectedBy: actorUserId,
        rejectReason: input.reason,
      },
    });
    await auditService.log(
      {
        actorUserId,
        actorSource: 'user',
        action: 'import.reject',
        resourceType: 'import_batch',
        resourceId: batchId,
        projectId: batch.projectId,
        beforeJson: { status: batch.status },
        afterJson: { status: 'rejected', reason: input.reason },
        reason: input.reason,
      },
      tx,
    );
  });
}

// ---------------------------------------------------------------------------
// Cancel — operator aborts a staged batch before any commit
// ---------------------------------------------------------------------------

export async function cancelBatch(batchId: string, actorUserId: string) {
  const batch = await prisma.importBatch.findUniqueOrThrow({
    where: { id: batchId },
  });
  if (batch.status === 'committed' || batch.status === 'rejected' || batch.status === 'cancelled') {
    throw new ImportBatchNotReadyError(batch.status, ['staged', 'validated', 'partially_valid']);
  }
  await prisma.$transaction(async (tx) => {
    await tx.importBatch.update({
      where: { id: batchId },
      data: {
        status: 'cancelled',
        cancelledAt: new Date(),
        cancelledBy: actorUserId,
      },
    });
    await auditService.log(
      {
        actorUserId,
        actorSource: 'user',
        action: 'import.cancel',
        resourceType: 'import_batch',
        resourceId: batchId,
        projectId: batch.projectId,
        beforeJson: { status: batch.status },
        afterJson: { status: 'cancelled' },
      },
      tx,
    );
  });
}

// ---------------------------------------------------------------------------
// Query helpers
// ---------------------------------------------------------------------------

/**
 * Resolve a set of user IDs to `{ id, name, email }` triples.
 *
 * `uploadedBy`, `committedBy`, `cancelledBy`, `rejectedBy` on ImportBatch are
 * all **soft FKs** (String columns, no Prisma relation) so we cannot `include`
 * them. We do one batched lookup per list/get call and attach the resolved
 * records to the returned items — the UI then renders the user's name instead
 * of a UUID fragment.
 */
async function resolveUserSummaries(
  ids: Array<string | null | undefined>,
): Promise<Map<string, { id: string; name: string; email: string }>> {
  const unique = [...new Set(ids.filter((v): v is string => !!v))];
  if (unique.length === 0) return new Map();
  const users = await prisma.user.findMany({
    where: { id: { in: unique } },
    select: { id: true, name: true, email: true },
  });
  return new Map(users.map((u) => [u.id, u]));
}

type UserSummary = { id: string; name: string; email: string };

export async function listBatches(input: {
  projectId?: string | null;
  importType?: ImportType | null;
  status?: ImportBatchStatus | null;
  skip?: number;
  take?: number;
}) {
  const where: Prisma.ImportBatchWhereInput = {};
  if (input.projectId) where.projectId = input.projectId;
  if (input.importType) where.importType = input.importType;
  if (input.status) where.status = input.status;

  const [rawItems, total] = await Promise.all([
    prisma.importBatch.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: input.skip ?? 0,
      take: input.take ?? 20,
      include: { project: { select: { name: true, code: true } } },
    }),
    prisma.importBatch.count({ where }),
  ]);

  const userMap = await resolveUserSummaries(
    rawItems.flatMap((b) => [
      b.uploadedBy,
      b.committedBy,
      b.cancelledBy,
      b.rejectedBy,
    ]),
  );

  const items = rawItems.map((b) => ({
    ...b,
    uploader: userMap.get(b.uploadedBy) ?? null,
    committer: b.committedBy ? (userMap.get(b.committedBy) ?? null) : null,
    canceller: b.cancelledBy ? (userMap.get(b.cancelledBy) ?? null) : null,
    rejecter: b.rejectedBy ? (userMap.get(b.rejectedBy) ?? null) : null,
  })) as Array<
    (typeof rawItems)[number] & {
      uploader: UserSummary | null;
      committer: UserSummary | null;
      canceller: UserSummary | null;
      rejecter: UserSummary | null;
    }
  >;

  return { items, total };
}

export async function getBatch(batchId: string) {
  const batch = await prisma.importBatch.findUniqueOrThrow({
    where: { id: batchId },
    include: {
      project: { select: { name: true, code: true, currencyCode: true } },
      rows: { orderBy: { rowNumber: 'asc' } },
    },
  });

  // Gather every user-reference that might show up in the detail UI: the
  // batch-level actors plus any per-row excluder.
  const rowExcluderIds = batch.rows
    .map((r) => r.excludedByUserId)
    .filter((v): v is string => !!v);

  const userMap = await resolveUserSummaries([
    batch.uploadedBy,
    batch.committedBy,
    batch.cancelledBy,
    batch.rejectedBy,
    ...rowExcluderIds,
  ]);

  return {
    ...batch,
    uploader: userMap.get(batch.uploadedBy) ?? null,
    committer: batch.committedBy
      ? (userMap.get(batch.committedBy) ?? null)
      : null,
    canceller: batch.cancelledBy
      ? (userMap.get(batch.cancelledBy) ?? null)
      : null,
    rejecter: batch.rejectedBy
      ? (userMap.get(batch.rejectedBy) ?? null)
      : null,
    rows: batch.rows.map((r) => ({
      ...r,
      excludedBy: r.excludedByUserId
        ? (userMap.get(r.excludedByUserId) ?? null)
        : null,
    })),
  };
}
