/**
 * Budget absorption handlers — update BudgetLine amounts when procurement
 * records change status.
 *
 * Each handler loads the source record, resolves the procurement category
 * to a budget category (by code match), and atomically increments/decrements
 * the relevant BudgetLine field.
 *
 * EXCEPTION POLICY (replaces prior silent-skip design):
 *   When absorption cannot proceed because of missing mapping or structure,
 *   the handler creates a BudgetAbsorptionException record and returns.
 *   The status transition still succeeds — absorption failure does NOT block
 *   the business operation. But the exception is visible to admins and must
 *   be resolved manually.
 */

import { prisma, Prisma } from '@fmksa/db';
import { auditService } from '../audit/service';

// ---------------------------------------------------------------------------
// Return types — every caller knows exactly what happened
// ---------------------------------------------------------------------------

export type AbsorptionResult =
  | { absorbed: true; budgetLineId: string; amount: string }
  | { absorbed: false; exceptionId: string; reasonCode: string; message: string };

// ---------------------------------------------------------------------------
// Exception helper — replaces silent returns, returns the exception id
// ---------------------------------------------------------------------------

async function recordAbsorptionException(params: {
  projectId: string;
  sourceModule: string;
  sourceRecordType: string;
  sourceRecordId: string;
  absorptionType: string;
  reasonCode: string;
  message: string;
  severity?: string;
}): Promise<string> {
  const ex = await prisma.budgetAbsorptionException.create({
    data: {
      projectId: params.projectId,
      sourceModule: params.sourceModule,
      sourceRecordType: params.sourceRecordType,
      sourceRecordId: params.sourceRecordId,
      absorptionType: params.absorptionType,
      reasonCode: params.reasonCode,
      message: params.message,
      severity: params.severity ?? 'warning',
      status: 'open',
    },
  });
  return ex.id;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Resolve a ProcurementCategory id to the matching BudgetLine within a
 * project's budget. Returns the resolution result or a reasonCode string
 * explaining why it failed.
 */
async function resolveBudgetLine(
  projectId: string,
  procurementCategoryId: string,
): Promise<
  | { ok: true; budgetLine: { id: string; committedAmount: Prisma.Decimal; actualAmount: Prisma.Decimal }; budgetId: string }
  | { ok: false; reasonCode: string; message: string }
> {
  // 1. Find the project's budget
  const budget = await prisma.projectBudget.findUnique({
    where: { projectId },
    select: { id: true },
  });
  if (!budget) {
    return { ok: false, reasonCode: 'no_budget', message: 'Project has no active ProjectBudget.' };
  }

  // 2. Load the procurement category to get its code
  const procCat = await prisma.procurementCategory.findUnique({
    where: { id: procurementCategoryId },
    select: { code: true },
  });
  if (!procCat) {
    return { ok: false, reasonCode: 'no_procurement_category', message: `ProcurementCategory ${procurementCategoryId} not found.` };
  }

  // 3. Find the matching BudgetCategory by code
  const budgetCat = await prisma.budgetCategory.findUnique({
    where: { code: procCat.code },
    select: { id: true },
  });
  if (!budgetCat) {
    return { ok: false, reasonCode: 'no_budget_category', message: `No BudgetCategory matches ProcurementCategory code '${procCat.code}'.` };
  }

  // 4. Find the BudgetLine for this budget + category pair
  const budgetLine = await prisma.budgetLine.findUnique({
    where: {
      budgetId_categoryId: {
        budgetId: budget.id,
        categoryId: budgetCat.id,
      },
    },
    select: { id: true, committedAmount: true, actualAmount: true },
  });
  if (!budgetLine) {
    return { ok: false, reasonCode: 'no_budget_line', message: `No BudgetLine for BudgetCategory '${procCat.code}' in ProjectBudget.` };
  }

  return { ok: true, budgetLine, budgetId: budget.id };
}

// ---------------------------------------------------------------------------
// PO commitment absorption
// ---------------------------------------------------------------------------

export async function absorbPoCommitment(
  projectId: string,
  purchaseOrderId: string,
  actorUserId: string,
): Promise<AbsorptionResult> {
  try {
    const po = await prisma.purchaseOrder.findUniqueOrThrow({
      where: { id: purchaseOrderId },
      select: { id: true, categoryId: true, totalAmount: true },
    });

    if (!po.categoryId) {
      const exId = await recordAbsorptionException({
        projectId,
        sourceModule: 'procurement',
        sourceRecordType: 'purchase_order',
        sourceRecordId: purchaseOrderId,
        absorptionType: 'po_commitment',
        reasonCode: 'no_category',
        message: 'PO has no categoryId — commitment cannot be absorbed into budget.',
      });
      return { absorbed: false, exceptionId: exId, reasonCode: 'no_category', message: 'PO has no categoryId.' };
    }

    const resolved = await resolveBudgetLine(projectId, po.categoryId);
    if (!resolved.ok) {
      const exId = await recordAbsorptionException({
        projectId,
        sourceModule: 'procurement',
        sourceRecordType: 'purchase_order',
        sourceRecordId: purchaseOrderId,
        absorptionType: 'po_commitment',
        reasonCode: resolved.reasonCode,
        message: resolved.message,
      });
      return { absorbed: false, exceptionId: exId, reasonCode: resolved.reasonCode, message: resolved.message };
    }

    const amount = new Prisma.Decimal(po.totalAmount.toString());

    await prisma.budgetLine.update({
      where: { id: resolved.budgetLine.id },
      data: {
        committedAmount: { increment: amount },
      },
    });

    await auditService.log({
      actorUserId,
      actorSource: 'system',
      action: 'budget.absorb_po_commitment',
      resourceType: 'budget_line',
      resourceId: resolved.budgetLine.id,
      projectId,
      beforeJson: {
        committedAmount: resolved.budgetLine.committedAmount.toString(),
      },
      afterJson: {
        committedAmount: resolved.budgetLine.committedAmount.plus(amount).toString(),
        purchaseOrderId,
        incrementedBy: amount.toString(),
      },
    });
    return { absorbed: true, budgetLineId: resolved.budgetLine.id, amount: amount.toString() };
  } catch (err) {
    // Last-resort catch: record exception so the failure is NEVER silent
    try {
      const exId = await recordAbsorptionException({
        projectId,
        sourceModule: 'procurement',
        sourceRecordType: 'purchase_order',
        sourceRecordId: purchaseOrderId,
        absorptionType: 'po_commitment',
        reasonCode: 'internal_error',
        message: `Absorption crashed: ${err instanceof Error ? err.message : String(err)}`,
        severity: 'critical',
      });
      return { absorbed: false, exceptionId: exId, reasonCode: 'internal_error', message: String(err) };
    } catch {
      // If even exception recording fails, return a synthetic failure — never throw
      return { absorbed: false, exceptionId: 'recording_failed', reasonCode: 'internal_error', message: `Absorption and exception recording both failed: ${err instanceof Error ? err.message : String(err)}` };
    }
  }
}

// ---------------------------------------------------------------------------
// PO commitment reversal
// ---------------------------------------------------------------------------

export async function reversePoCommitment(
  projectId: string,
  purchaseOrderId: string,
  actorUserId: string,
): Promise<AbsorptionResult> {
  try {
    const po = await prisma.purchaseOrder.findUniqueOrThrow({
      where: { id: purchaseOrderId },
      select: { id: true, categoryId: true, totalAmount: true },
    });

    if (!po.categoryId) {
      const exId = await recordAbsorptionException({
        projectId,
        sourceModule: 'procurement',
        sourceRecordType: 'purchase_order',
        sourceRecordId: purchaseOrderId,
        absorptionType: 'po_reversal',
        reasonCode: 'no_category',
        message: 'PO has no categoryId — commitment reversal cannot be applied.',
      });
      return { absorbed: false, exceptionId: exId, reasonCode: 'no_category', message: 'PO has no categoryId.' };
    }

    const resolved = await resolveBudgetLine(projectId, po.categoryId);
    if (!resolved.ok) {
      const exId = await recordAbsorptionException({
        projectId,
        sourceModule: 'procurement',
        sourceRecordType: 'purchase_order',
        sourceRecordId: purchaseOrderId,
        absorptionType: 'po_reversal',
        reasonCode: resolved.reasonCode,
        message: resolved.message,
      });
      return { absorbed: false, exceptionId: exId, reasonCode: resolved.reasonCode, message: resolved.message };
    }

    const amount = new Prisma.Decimal(po.totalAmount.toString());

    await prisma.budgetLine.update({
      where: { id: resolved.budgetLine.id },
      data: {
        committedAmount: { decrement: amount },
      },
    });

    await auditService.log({
      actorUserId,
      actorSource: 'system',
      action: 'budget.reverse_po_commitment',
      resourceType: 'budget_line',
      resourceId: resolved.budgetLine.id,
      projectId,
      beforeJson: {
        committedAmount: resolved.budgetLine.committedAmount.toString(),
      },
      afterJson: {
        committedAmount: resolved.budgetLine.committedAmount.minus(amount).toString(),
        purchaseOrderId,
        decrementedBy: amount.toString(),
      },
    });
    return { absorbed: true, budgetLineId: resolved.budgetLine.id, amount: amount.toString() };
  } catch (err) {
    try {
      const exId = await recordAbsorptionException({
        projectId,
        sourceModule: 'procurement',
        sourceRecordType: 'purchase_order',
        sourceRecordId: purchaseOrderId,
        absorptionType: 'po_reversal',
        reasonCode: 'internal_error',
        message: `Reversal crashed: ${err instanceof Error ? err.message : String(err)}`,
        severity: 'critical',
      });
      return { absorbed: false, exceptionId: exId, reasonCode: 'internal_error', message: String(err) };
    } catch {
      return { absorbed: false, exceptionId: 'recording_failed', reasonCode: 'internal_error', message: `Reversal and exception recording both failed: ${err instanceof Error ? err.message : String(err)}` };
    }
  }
}

// ---------------------------------------------------------------------------
// Supplier invoice actual absorption
// ---------------------------------------------------------------------------

export async function absorbSupplierInvoiceActual(
  projectId: string,
  supplierInvoiceId: string,
  actorUserId: string,
): Promise<AbsorptionResult> {
  try {
    const si = await prisma.supplierInvoice.findUniqueOrThrow({
      where: { id: supplierInvoiceId },
      select: {
        id: true,
        categoryId: true,
        totalAmount: true,
        purchaseOrder: {
          select: { categoryId: true },
        },
      },
    });

    const categoryId = si.categoryId ?? si.purchaseOrder?.categoryId ?? null;
    if (!categoryId) {
      const exId = await recordAbsorptionException({
        projectId,
        sourceModule: 'procurement',
        sourceRecordType: 'supplier_invoice',
        sourceRecordId: supplierInvoiceId,
        absorptionType: 'si_actual',
        reasonCode: 'no_category',
        message: 'Supplier invoice has no categoryId and linked PO has no categoryId — actual cost cannot be absorbed.',
      });
      return { absorbed: false, exceptionId: exId, reasonCode: 'no_category', message: 'SI has no resolvable categoryId.' };
    }

    const resolved = await resolveBudgetLine(projectId, categoryId);
    if (!resolved.ok) {
      const exId = await recordAbsorptionException({
        projectId,
        sourceModule: 'procurement',
        sourceRecordType: 'supplier_invoice',
        sourceRecordId: supplierInvoiceId,
        absorptionType: 'si_actual',
        reasonCode: resolved.reasonCode,
        message: resolved.message,
      });
      return { absorbed: false, exceptionId: exId, reasonCode: resolved.reasonCode, message: resolved.message };
    }

    const amount = new Prisma.Decimal(si.totalAmount.toString());

    await prisma.budgetLine.update({
      where: { id: resolved.budgetLine.id },
      data: {
        actualAmount: { increment: amount },
      },
    });

    await auditService.log({
      actorUserId,
      actorSource: 'system',
      action: 'budget.absorb_supplier_invoice_actual',
      resourceType: 'budget_line',
      resourceId: resolved.budgetLine.id,
      projectId,
      beforeJson: {
        actualAmount: resolved.budgetLine.actualAmount.toString(),
      },
      afterJson: {
        actualAmount: resolved.budgetLine.actualAmount.plus(amount).toString(),
        supplierInvoiceId,
        incrementedBy: amount.toString(),
      },
    });
    return { absorbed: true, budgetLineId: resolved.budgetLine.id, amount: amount.toString() };
  } catch (err) {
    try {
      const exId = await recordAbsorptionException({
        projectId,
        sourceModule: 'procurement',
        sourceRecordType: 'supplier_invoice',
        sourceRecordId: supplierInvoiceId,
        absorptionType: 'si_actual',
        reasonCode: 'internal_error',
        message: `Absorption crashed: ${err instanceof Error ? err.message : String(err)}`,
        severity: 'critical',
      });
      return { absorbed: false, exceptionId: exId, reasonCode: 'internal_error', message: String(err) };
    } catch {
      return { absorbed: false, exceptionId: 'recording_failed', reasonCode: 'internal_error', message: `Absorption and exception recording both failed: ${err instanceof Error ? err.message : String(err)}` };
    }
  }
}

// ---------------------------------------------------------------------------
// Expense actual absorption
// ---------------------------------------------------------------------------

export async function absorbExpenseActual(
  projectId: string,
  expenseId: string,
  actorUserId: string,
): Promise<AbsorptionResult> {
  try {
    const expense = await prisma.expense.findUniqueOrThrow({
      where: { id: expenseId },
      select: { id: true, categoryId: true, amount: true },
    });

    if (!expense.categoryId) {
      const exId = await recordAbsorptionException({
        projectId,
        sourceModule: 'procurement',
        sourceRecordType: 'expense',
        sourceRecordId: expenseId,
        absorptionType: 'expense_actual',
        reasonCode: 'no_category',
        message: 'Expense has no categoryId — actual cost cannot be absorbed into budget.',
      });
      return { absorbed: false, exceptionId: exId, reasonCode: 'no_category', message: 'Expense has no categoryId.' };
    }

    const resolved = await resolveBudgetLine(projectId, expense.categoryId);
    if (!resolved.ok) {
      const exId = await recordAbsorptionException({
        projectId,
        sourceModule: 'procurement',
        sourceRecordType: 'expense',
        sourceRecordId: expenseId,
        absorptionType: 'expense_actual',
        reasonCode: resolved.reasonCode,
        message: resolved.message,
      });
      return { absorbed: false, exceptionId: exId, reasonCode: resolved.reasonCode, message: resolved.message };
    }

    const amount = new Prisma.Decimal(expense.amount.toString());

    await prisma.budgetLine.update({
      where: { id: resolved.budgetLine.id },
      data: {
        actualAmount: { increment: amount },
      },
    });

    await auditService.log({
      actorUserId,
      actorSource: 'system',
      action: 'budget.absorb_expense_actual',
      resourceType: 'budget_line',
      resourceId: resolved.budgetLine.id,
      projectId,
      beforeJson: {
        actualAmount: resolved.budgetLine.actualAmount.toString(),
      },
      afterJson: {
        actualAmount: resolved.budgetLine.actualAmount.plus(amount).toString(),
        expenseId,
        incrementedBy: amount.toString(),
      },
    });
    return { absorbed: true, budgetLineId: resolved.budgetLine.id, amount: amount.toString() };
  } catch (err) {
    try {
      const exId = await recordAbsorptionException({
        projectId,
        sourceModule: 'procurement',
        sourceRecordType: 'expense',
        sourceRecordId: expenseId,
        absorptionType: 'expense_actual',
        reasonCode: 'internal_error',
        message: `Absorption crashed: ${err instanceof Error ? err.message : String(err)}`,
        severity: 'critical',
      });
      return { absorbed: false, exceptionId: exId, reasonCode: 'internal_error', message: String(err) };
    } catch {
      return { absorbed: false, exceptionId: 'recording_failed', reasonCode: 'internal_error', message: `Absorption and exception recording both failed: ${err instanceof Error ? err.message : String(err)}` };
    }
  }
}

// ---------------------------------------------------------------------------
// Credit note reversal absorption
// ---------------------------------------------------------------------------

export async function absorbCreditNoteReversal(
  projectId: string,
  creditNoteId: string,
  actorUserId: string,
): Promise<AbsorptionResult> {
  try {
    const cn = await prisma.creditNote.findUniqueOrThrow({
      where: { id: creditNoteId },
      select: {
        id: true,
        amount: true,
        supplierInvoiceId: true,
        purchaseOrderId: true,
        supplierInvoice: {
          select: {
            categoryId: true,
            purchaseOrder: {
              select: { categoryId: true },
            },
          },
        },
        purchaseOrder: {
          select: { categoryId: true },
        },
      },
    });

    // Resolve categoryId: SI.categoryId -> SI.PO.categoryId -> CN.PO.categoryId
    const categoryId =
      cn.supplierInvoice?.categoryId ??
      cn.supplierInvoice?.purchaseOrder?.categoryId ??
      cn.purchaseOrder?.categoryId ??
      null;

    if (!categoryId) {
      const exId = await recordAbsorptionException({
        projectId,
        sourceModule: 'procurement',
        sourceRecordType: 'credit_note',
        sourceRecordId: creditNoteId,
        absorptionType: 'cn_reversal',
        reasonCode: 'no_category',
        message: 'Credit note has no resolvable categoryId — actual cost reversal cannot be applied.',
      });
      return { absorbed: false, exceptionId: exId, reasonCode: 'no_category', message: 'CN has no resolvable categoryId.' };
    }

    const resolved = await resolveBudgetLine(projectId, categoryId);
    if (!resolved.ok) {
      const exId = await recordAbsorptionException({
        projectId,
        sourceModule: 'procurement',
        sourceRecordType: 'credit_note',
        sourceRecordId: creditNoteId,
        absorptionType: 'cn_reversal',
        reasonCode: resolved.reasonCode,
        message: resolved.message,
      });
      return { absorbed: false, exceptionId: exId, reasonCode: resolved.reasonCode, message: resolved.message };
    }

    const amount = new Prisma.Decimal(cn.amount.toString());

    await prisma.budgetLine.update({
      where: { id: resolved.budgetLine.id },
      data: {
        actualAmount: { decrement: amount },
      },
    });

    await auditService.log({
      actorUserId,
      actorSource: 'system',
      action: 'budget.absorb_credit_note_reversal',
      resourceType: 'budget_line',
      resourceId: resolved.budgetLine.id,
      projectId,
      beforeJson: {
        actualAmount: resolved.budgetLine.actualAmount.toString(),
      },
      afterJson: {
        actualAmount: resolved.budgetLine.actualAmount.minus(amount).toString(),
        creditNoteId,
        decrementedBy: amount.toString(),
      },
    });
    return { absorbed: true, budgetLineId: resolved.budgetLine.id, amount: amount.toString() };
  } catch (err) {
    try {
      const exId = await recordAbsorptionException({
        projectId,
        sourceModule: 'procurement',
        sourceRecordType: 'credit_note',
        sourceRecordId: creditNoteId,
        absorptionType: 'cn_reversal',
        reasonCode: 'internal_error',
        message: `Reversal crashed: ${err instanceof Error ? err.message : String(err)}`,
        severity: 'critical',
      });
      return { absorbed: false, exceptionId: exId, reasonCode: 'internal_error', message: String(err) };
    } catch {
      return { absorbed: false, exceptionId: 'recording_failed', reasonCode: 'internal_error', message: `Reversal and exception recording both failed: ${err instanceof Error ? err.message : String(err)}` };
    }
  }
}

// Re-export the exception helper for EI reserve and other callers
export { recordAbsorptionException };
