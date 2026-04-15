/**
 * Budget baseline committer.
 *
 * For each valid ImportRow in a batch:
 *   1. Look up the matching BudgetCategory by code (confirmed during
 *      validation, re-read here to resolve its ID).
 *   2. Find-or-create the ProjectBudget for the project.
 *   3. Find the matching BudgetLine (one per category by schema design)
 *      and update its `budgetAmount` + `lastImportedAmount`, stamp with
 *      importBatchId / importRowId / importedByUserId / importedAt.
 *   4. Record a BudgetAdjustment row of type 'line_import' with
 *      before/after amounts so the history is discoverable from the
 *      budget page.
 *   5. Mark the ImportRow committed with `committedRecordType` = 'budget_line'.
 *
 * No posting events are emitted for budget imports. Budget values are not
 * a posting-ledger concern in M2/M3 — they only back the internal KPI view.
 */

import type { Prisma } from '@fmksa/db';
import type { ImportIssue, ParsedBudgetBaselineRow, RowCommitResult } from '../types';
import { auditService } from '../../audit/service';

type Tx = Prisma.TransactionClient;

export async function commitBudgetBaselineRow(
  tx: Tx,
  ctx: {
    projectId: string;
    batchId: string;
    importRowId: string;
    rowNumber: number;
    actorUserId: string;
  },
  parsed: ParsedBudgetBaselineRow,
): Promise<RowCommitResult> {
  const errors: ImportIssue[] = [];

  const category = await tx.budgetCategory.findUnique({
    where: { code: parsed.categoryCode },
    select: { id: true, name: true, code: true },
  });
  if (!category) {
    errors.push({
      code: 'category_missing_at_commit',
      field: 'category_code',
      message: `Category '${parsed.categoryCode}' not found at commit time.`,
    });
    return { rowNumber: ctx.rowNumber, status: 'invalid', errors };
  }

  // Find-or-bootstrap the ProjectBudget for the project.
  let budget = await tx.projectBudget.findUnique({
    where: { projectId: ctx.projectId },
  });
  if (!budget) {
    budget = await tx.projectBudget.create({
      data: {
        projectId: ctx.projectId,
        internalBaseline: 0,
        internalRevised: 0,
        contingencyAmount: 0,
        createdBy: ctx.actorUserId,
      },
    });
    // Seed budget lines: one per category.
    const cats = await tx.budgetCategory.findMany({
      orderBy: { sortOrder: 'asc' },
    });
    await tx.budgetLine.createMany({
      data: cats.map((c) => ({
        budgetId: budget!.id,
        categoryId: c.id,
        budgetAmount: 0,
        committedAmount: 0,
        actualAmount: 0,
      })),
    });
  }

  const line = await tx.budgetLine.findFirst({
    where: { budgetId: budget.id, categoryId: category.id },
  });
  if (!line) {
    errors.push({
      code: 'budget_line_missing',
      field: 'category_code',
      message: `No budget line exists for category '${parsed.categoryCode}'. This should not happen after seeding.`,
    });
    return { rowNumber: ctx.rowNumber, status: 'invalid', errors };
  }

  const beforeAmount = line.budgetAmount.toString();
  const afterAmount = parsed.budgetAmount;

  const updated = await tx.budgetLine.update({
    where: { id: line.id },
    data: {
      budgetAmount: parsed.budgetAmount,
      notes: parsed.notes ?? line.notes,
      importBatchId: ctx.batchId,
      importRowId: ctx.importRowId,
      lastImportedAmount: parsed.budgetAmount,
      importedByUserId: ctx.actorUserId,
      importedAt: new Date(),
    },
  });

  await tx.budgetAdjustment.create({
    data: {
      budgetId: budget.id,
      budgetLineId: line.id,
      adjustmentType: 'line_import',
      amount: parsed.budgetAmount,
      beforeAmount,
      afterAmount,
      reason: `Sheet import — batch ${ctx.batchId} row ${ctx.rowNumber}`,
      importBatchId: ctx.batchId,
      createdBy: ctx.actorUserId,
    },
  });

  await auditService.log(
    {
      actorUserId: ctx.actorUserId,
      actorSource: 'user',
      action: 'import.commit.budget_line',
      resourceType: 'budget_line',
      resourceId: line.id,
      projectId: ctx.projectId,
      beforeJson: { budgetAmount: beforeAmount },
      afterJson: {
        budgetAmount: afterAmount,
        importBatchId: ctx.batchId,
        importRowId: ctx.importRowId,
      },
    },
    tx as Prisma.TransactionClient,
  );

  return {
    rowNumber: ctx.rowNumber,
    status: 'committed',
    committedRecordType: 'budget_line',
    committedRecordId: updated.id,
  };
}
