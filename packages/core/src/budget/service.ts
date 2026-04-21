/**
 * Internal Budget service — project-scoped budget management.
 *
 * Module 4: Internal Budget Control.
 *
 * Internal budget is SEPARATE from the external contract value.
 * Contract value = what the client pays Pico Play.
 * Internal budget = what Pico Play allocates to deliver the project.
 */
import { prisma } from '@fmksa/db';
import type { BudgetAdjustmentType } from '@fmksa/db';
import { auditService } from '../audit/service';

// ---------------------------------------------------------------------------
// Get
// ---------------------------------------------------------------------------

export async function getBudget(projectId: string) {
  return prisma.projectBudget.findUnique({
    where: { projectId },
    include: {
      lines: {
        include: { category: true },
        orderBy: { category: { sortOrder: 'asc' } },
      },
      adjustments: { orderBy: { createdAt: 'desc' } },
    },
  });
}

// ---------------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------------

export async function createBudget(
  input: {
    projectId: string;
    internalBaseline: number;
    contingencyAmount?: number | undefined;
    notes?: string | undefined;
  },
  actorUserId: string,
) {
  const budget = await prisma.$transaction(async (tx) => {
    // Create the header — internalRevised starts equal to internalBaseline
    const created = await (tx as any).projectBudget.create({
      data: {
        projectId: input.projectId,
        internalBaseline: input.internalBaseline,
        internalRevised: input.internalBaseline,
        contingencyAmount: input.contingencyAmount ?? 0,
        notes: input.notes ?? null,
        createdBy: actorUserId,
      },
    });

    // Auto-create one BudgetLine per BudgetCategory (all amounts start at 0)
    const categories = await (tx as any).budgetCategory.findMany({
      orderBy: { sortOrder: 'asc' },
    });

    if (categories.length > 0) {
      await (tx as any).budgetLine.createMany({
        data: categories.map((cat: { id: string }) => ({
          budgetId: created.id,
          categoryId: cat.id,
          budgetAmount: 0,
          committedAmount: 0,
          actualAmount: 0,
        })),
      });
    }

    // Re-fetch with lines included
    const full = await (tx as any).projectBudget.findUnique({
      where: { id: created.id },
      include: {
        lines: {
          include: { category: true },
          orderBy: { category: { sortOrder: 'asc' } },
        },
        adjustments: true,
      },
    });

    await auditService.log(
      {
        actorUserId,
        actorSource: 'user',
        action: 'project_budget.create',
        resourceType: 'project_budget',
        resourceId: created.id,
        projectId: input.projectId,
        beforeJson: null,
        afterJson: full as any,
      },
      tx,
    );

    return full;
  });

  return budget;
}

// ---------------------------------------------------------------------------
// Update header (revised amount, contingency, notes)
// ---------------------------------------------------------------------------

export async function updateBudget(
  input: {
    projectId: string;
    internalRevised?: number | undefined;
    contingencyAmount?: number | undefined;
    notes?: string | undefined;
  },
  actorUserId: string,
) {
  const existing = await prisma.projectBudget.findUniqueOrThrow({
    where: { projectId: input.projectId },
  });

  const data: Record<string, unknown> = {};
  if (input.internalRevised !== undefined) data.internalRevised = input.internalRevised;
  if (input.contingencyAmount !== undefined) data.contingencyAmount = input.contingencyAmount;
  if (input.notes !== undefined) data.notes = input.notes;

  const updated = await prisma.projectBudget.update({
    where: { projectId: input.projectId },
    data,
    include: {
      lines: {
        include: { category: true },
        orderBy: { category: { sortOrder: 'asc' } },
      },
    },
  });

  await auditService.log({
    actorUserId,
    actorSource: 'user',
    action: 'project_budget.update',
    resourceType: 'project_budget',
    resourceId: existing.id,
    projectId: input.projectId,
    beforeJson: existing as any,
    afterJson: updated as any,
  });

  return updated;
}

// ---------------------------------------------------------------------------
// Update a single budget line allocation
// ---------------------------------------------------------------------------

export async function updateBudgetLine(
  input: {
    budgetLineId: string;
    budgetAmount: number;
    notes?: string | undefined;
    /**
     * Optional operator-supplied rationale for the change. When provided,
     * it becomes the BudgetAdjustment.reason; when omitted, the adjustment
     * record uses a canned description.
     */
    reason?: string | undefined;
  },
  actorUserId: string,
) {
  const existing = await prisma.budgetLine.findUniqueOrThrow({
    where: { id: input.budgetLineId },
    include: { budget: true },
  });

  const beforeAmount = existing.budgetAmount.toString();
  const afterAmount = input.budgetAmount.toFixed(2);
  const amountChanged = beforeAmount !== afterAmount;

  const updateData: Record<string, unknown> = {
    budgetAmount: input.budgetAmount,
  };
  if (input.notes !== undefined) updateData.notes = input.notes;

  const { updated } = await prisma.$transaction(async (tx) => {
    const upd = await (tx as any).budgetLine.update({
      where: { id: input.budgetLineId },
      data: updateData,
      include: { category: true },
    });

    // Append-only per-line history — ALWAYS written on manual amount changes.
    // Keeps the reconciliation story honest: a late hand-edit to a budget
    // line is visible in the budget page even when the top-level totals
    // look right.
    if (amountChanged) {
      await (tx as any).budgetAdjustment.create({
        data: {
          budgetId: existing.budgetId,
          budgetLineId: existing.id,
          adjustmentType: 'line_manual_adjustment',
          amount: input.budgetAmount,
          beforeAmount,
          afterAmount,
          reason:
            input.reason?.trim() ||
            `Manual budget line adjustment (${beforeAmount} → ${afterAmount})`,
          createdBy: actorUserId,
        },
      });
    }

    await auditService.log(
      {
        actorUserId,
        actorSource: 'user',
        action: 'project_budget.update_line',
        resourceType: 'project_budget',
        resourceId: existing.budgetId,
        projectId: existing.budget.projectId,
        beforeJson: existing as any,
        afterJson: upd as any,
        reason: input.reason ?? null,
      },
      tx,
    );

    return { updated: upd };
  });

  return updated;
}

// ---------------------------------------------------------------------------
// Record an adjustment (auditable event, append-only)
// ---------------------------------------------------------------------------

export async function recordAdjustment(
  input: {
    projectId: string;
    adjustmentType: string;
    amount: number;
    reason: string;
    approvedBy?: string | undefined;
  },
  actorUserId: string,
) {
  const budget = await prisma.projectBudget.findUniqueOrThrow({
    where: { projectId: input.projectId },
  });

  const adjustment = await prisma.$transaction(async (tx) => {
    const created = await (tx as any).budgetAdjustment.create({
      data: {
        budgetId: budget.id,
        adjustmentType: input.adjustmentType as BudgetAdjustmentType,
        amount: input.amount,
        reason: input.reason,
        approvedBy: input.approvedBy ?? null,
        createdBy: actorUserId,
      },
    });

    await auditService.log(
      {
        actorUserId,
        actorSource: 'user',
        action: `project_budget.adjustment.${input.adjustmentType}`,
        resourceType: 'project_budget',
        resourceId: budget.id,
        projectId: input.projectId,
        beforeJson: null,
        afterJson: created as any,
        reason: input.reason,
      },
      tx,
    );

    return created;
  });

  return adjustment;
}

// ---------------------------------------------------------------------------
// Budget summary with derived fields
// ---------------------------------------------------------------------------

export async function getBudgetSummary(projectId: string) {
  const budget = await prisma.projectBudget.findUnique({
    where: { projectId },
    include: {
      lines: {
        include: { category: true },
        orderBy: { category: { sortOrder: 'asc' } },
      },
    },
  });

  if (!budget) return null;

  const internalBaseline = parseFloat(budget.internalBaseline.toString());
  const internalRevised = parseFloat(budget.internalRevised.toString());
  const contingencyAmount = parseFloat(budget.contingencyAmount.toString());
  const eiReserveTotal = parseFloat(budget.eiReserveTotal.toString());

  let totalBudgeted = 0;
  let totalCommitted = 0;
  let totalActual = 0;

  const lines = budget.lines.map((line) => {
    const budgetAmount = parseFloat(line.budgetAmount.toString());
    const committedAmount = parseFloat(line.committedAmount.toString());
    const actualAmount = parseFloat(line.actualAmount.toString());
    const lastImportedAmount =
      line.lastImportedAmount != null
        ? parseFloat(line.lastImportedAmount.toString())
        : null;

    totalBudgeted += budgetAmount;
    totalCommitted += committedAmount;
    totalActual += actualAmount;

    return {
      id: line.id,
      categoryId: line.categoryId,
      categoryCode: line.category.code,
      categoryName: line.category.name,
      budgetAmount,
      committedAmount,
      actualAmount,
      // Truth-first definitions (Path A, 2026-04-21):
      //   consumed       = committed + actual
      //   remainingAmount = budget − consumed
      //   varianceAmount  = consumed − budget
      //                     (negative = under budget, positive = over)
      //
      // These hold because absorbSupplierInvoiceActual now releases the PO
      // commitment progressively as invoices land, so committed + actual no
      // longer double-count a PO that has been invoiced. Before that fix
      // these formulas would have over-consumed and this comment would be
      // lying.
      remainingAmount: budgetAmount - committedAmount - actualAmount,
      varianceAmount: committedAmount + actualAmount - budgetAmount,
      notes: line.notes,
      // Import provenance — non-null when this line was written by an import commit.
      // lastImportedAmount is the frozen "what the sheet said" value and is NOT
      // mutated by subsequent manual adjustments, so UI can show imported vs current.
      importBatchId: line.importBatchId,
      importRowId: line.importRowId,
      importedAt: line.importedAt,
      importedByUserId: line.importedByUserId,
      lastImportedAmount,
    };
  });

  // Summary Remaining must reconcile with the rows above it. The row formula
  // is budget − committed − actual, so the summary is the same equation
  // applied to line totals: totalBudgeted − totalCommitted − totalActual.
  //
  // The previous implementation (internalRevised − totalCommitted) mixed the
  // header envelope with line-level commitments and ignored actuals, which
  // meant the summary Remaining and the sum of row Remainings could not
  // agree. `internalRevised` is still exposed as its own KPI for operators
  // who care about the envelope versus allocated deltas.
  const remainingBudget = totalBudgeted - totalCommitted - totalActual;
  const totalVariance = totalCommitted + totalActual - totalBudgeted;

  return {
    projectId: budget.projectId,
    budgetId: budget.id,
    internalBaseline,
    internalRevised,
    contingencyAmount,
    eiReserveTotal,
    totalBudgeted,
    totalCommitted,
    totalActual,
    remainingBudget,
    totalVariance,
    lines,
  };
}
