/**
 * PIC-101 — Budget variance math correctness (RED proof → GREEN fix).
 *
 * Recovers the INTENT of 9e2682b (the parked vigorous-mahavira budget-truth
 * fix), re-implemented against current main — NOT cherry-picked.
 *
 * Four defects this pins (all confirmed live on main 695f494):
 *
 *   D1  budget/service.ts:333  varianceAmount = budgetAmount − actualAmount
 *       → ignores commitments. A line with budget 6.5M / committed 2.4M /
 *         actual 0 reports variance = 6.5M. The honest figure is
 *         committed + actual − budget = −4.1M (under budget by 4.1M).
 *
 *   D2  budget/service.ts:332  remainingAmount = budgetAmount − committedAmount
 *       → excludes actual. Different denominator from variance, so a row's
 *         Remaining and Variance don't describe the same money.
 *
 *   D3  budget/service.ts:348  remainingBudget = internalRevised − totalCommitted
 *       → a THIRD denominator (internalRevised, not totalBudgeted; excludes
 *         totalActual). Summary cannot reconcile with the sum of row
 *         remainings whenever internalRevised ≠ totalBudgeted or actual > 0.
 *
 *   D4  budget/absorption.ts:349  absorbSupplierInvoiceActual increments
 *       actualAmount but never releases the PO's committedAmount. Once an SI
 *       lands against a PO, committed + actual double-counts the same money.
 *
 * Correct semantics (the fix, intent of 9e2682b):
 *   row.remainingAmount  = budget − committed − actual
 *   row.varianceAmount   = committed + actual − budget   (+over / −under / 0 on-plan)
 *   summary.remainingBudget = totalBudgeted − totalCommitted − totalActual
 *   summary.totalVariance   = totalCommitted + totalActual − totalBudgeted
 *   Σ(row.remainingAmount) == summary.remainingBudget   (reconciles by construction)
 *   SI absorption releases PO commitment (bounded at 0) so committed+actual
 *   stops double-counting.
 *
 * Run on UNFIXED main → this file FAILS (RED), printing main's wrong values.
 * Run after the fix → GREEN.
 *
 * Database-backed (test Postgres). Per-test fixtures; cleaned in afterAll.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma, SINGLETON_ORG_ID } from '@fmksa/db';
import {
  getBudgetSummary,
  absorbPoCommitment,
  absorbSupplierInvoiceActual,
} from '../../src/budget';

const ts = `pic101-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
const actor = 'pic101-test';

// Canonical screenshot case + an actual≠0 line + a divergent internalRevised.
//   internalBaseline (→ internalRevised) deliberately ≠ Σ(line budgets) so D3
//   (summary uses internalRevised, not totalBudgeted) is exposed.
const INTERNAL_BASELINE = 10_000_000; // internalRevised = 10M
// Line A — the screenshot case: 6.5M / 2.4M / 0
const A_BUDGET = 6_500_000, A_COMMITTED = 2_400_000, A_ACTUAL = 0;
// Line B — actual≠0, exposes D2 (remaining excludes actual) + summary actual
const B_BUDGET = 1_000_000, B_COMMITTED = 500_000, B_ACTUAL = 300_000;
// Σ line budgets = 7.5M  (≠ internalRevised 10M → D3 visible)

let projectId: string;
let entityId: string;
let budgetId: string;
let catAId: string;
let catBId: string;

// Defect-4 fixture (separate project so summary test stays clean)
let d4ProjectId: string;
let d4BudgetId: string;
let d4BudgetLineId: string;
let d4VendorId: string;
let d4PoId: string;
let d4SiId: string;
const D4_PO_TOTAL = 2_400_000;   // committed when PO absorbed
const D4_SI_TOTAL = 2_400_000;   // actual when SI absorbed; should RELEASE the commitment

beforeAll(async () => {
  process.env.SEED_CONTEXT = 'true';

  await prisma.currency.upsert({
    where: { code: 'SAR' }, update: {},
    create: { code: 'SAR', name: 'Saudi Riyal', symbol: 'SR', decimalPlaces: 2 },
  });

  // ── Project + budget for D1/D2/D3 ────────────────────────────────
  const entity = await prisma.entity.create({
    data: { orgId: SINGLETON_ORG_ID, code: `ENT-${ts}`, name: 'PIC-101 Entity', type: 'parent', status: 'active' },
  });
  entityId = entity.id;
  const project = await prisma.project.create({
    data: {
      orgId: SINGLETON_ORG_ID,
      entityId, code: `PROJ-${ts}`, name: 'PIC-101 Budget Math',
      status: 'active', currencyCode: 'SAR', startDate: new Date('2026-01-01'),
      createdBy: actor, contractValue: INTERNAL_BASELINE,
    },
  });
  projectId = project.id;

  const budget = await prisma.projectBudget.create({
    data: {
      orgId: SINGLETON_ORG_ID,
      projectId, internalBaseline: INTERNAL_BASELINE, internalRevised: INTERNAL_BASELINE,
      contingencyAmount: 0, createdBy: actor,
    },
  });
  budgetId = budget.id;

  const catA = await prisma.budgetCategory.create({
    data: { code: `CAT-A-${ts}`, name: 'Materials (PIC-101)', sortOrder: 1 },
  });
  const catB = await prisma.budgetCategory.create({
    data: { code: `CAT-B-${ts}`, name: 'Labour (PIC-101)', sortOrder: 2 },
  });
  catAId = catA.id;
  catBId = catB.id;

  await prisma.budgetLine.create({
    data: { budgetId, categoryId: catAId, budgetAmount: A_BUDGET, committedAmount: A_COMMITTED, actualAmount: A_ACTUAL },
  });
  await prisma.budgetLine.create({
    data: { budgetId, categoryId: catBId, budgetAmount: B_BUDGET, committedAmount: B_COMMITTED, actualAmount: B_ACTUAL },
  });

  // ── Defect-4 fixture: PO + SI chain on a second project ──────────
  const d4Project = await prisma.project.create({
    data: {
      orgId: SINGLETON_ORG_ID,
      entityId, code: `PROJ-D4-${ts}`, name: 'PIC-101 D4 double-count',
      status: 'active', currencyCode: 'SAR', startDate: new Date('2026-01-01'),
      createdBy: actor, contractValue: 5_000_000,
    },
  });
  d4ProjectId = d4Project.id;
  const d4Budget = await prisma.projectBudget.create({
    data: {
      orgId: SINGLETON_ORG_ID,
      projectId: d4ProjectId, internalBaseline: 5_000_000, internalRevised: 5_000_000,
      contingencyAmount: 0, createdBy: actor,
    },
  });
  d4BudgetId = d4Budget.id;

  // ProcurementCategory + BudgetCategory share a code (resolveBudgetLine maps by code)
  const sharedCode = `D4-MAT-${ts}`;
  const d4BudgetCat = await prisma.budgetCategory.create({
    data: { code: sharedCode, name: 'D4 Materials', sortOrder: 1 },
  });
  const d4ProcCat = await prisma.procurementCategory.create({
    data: { orgId: SINGLETON_ORG_ID, entityId, code: sharedCode, name: 'D4 Materials (proc)', level: 'category', status: 'active' },
  });
  const d4Line = await prisma.budgetLine.create({
    data: { budgetId: d4BudgetId, categoryId: d4BudgetCat.id, budgetAmount: 5_000_000, committedAmount: 0, actualAmount: 0 },
  });
  d4BudgetLineId = d4Line.id;

  const vendor = await prisma.vendor.create({
    data: { orgId: SINGLETON_ORG_ID, entityId, vendorCode: `VEN-${ts}`, name: 'PIC-101 Vendor', createdBy: actor },
  });
  d4VendorId = vendor.id;

  const po = await prisma.purchaseOrder.create({
    data: {
      orgId: SINGLETON_ORG_ID,
      projectId: d4ProjectId, vendorId: d4VendorId, categoryId: d4ProcCat.id,
      poNumber: `PO-${ts}`, title: 'D4 PO', totalAmount: D4_PO_TOTAL, currency: 'SAR', createdBy: actor,
    },
  });
  d4PoId = po.id;

  const si = await prisma.supplierInvoice.create({
    data: {
      orgId: SINGLETON_ORG_ID,
      projectId: d4ProjectId, vendorId: d4VendorId, purchaseOrderId: d4PoId,
      invoiceNumber: `SI-${ts}`, invoiceDate: new Date('2026-03-01'),
      grossAmount: D4_SI_TOTAL, vatRate: 0, vatAmount: 0, totalAmount: D4_SI_TOTAL,
      currency: 'SAR', createdBy: actor,
    },
  });
  d4SiId = si.id;

  delete process.env.SEED_CONTEXT;
}, 60_000);

afterAll(async () => {
  process.env.SEED_CONTEXT = 'true';
  await prisma.supplierInvoice.deleteMany({ where: { projectId: d4ProjectId } });
  await prisma.purchaseOrder.deleteMany({ where: { projectId: d4ProjectId } });
  await prisma.vendor.deleteMany({ where: { id: d4VendorId } });
  await prisma.budgetLine.deleteMany({ where: { budgetId: { in: [budgetId, d4BudgetId] } } });
  await prisma.projectBudget.deleteMany({ where: { id: { in: [budgetId, d4BudgetId] } } });
  await prisma.budgetCategory.deleteMany({ where: { code: { contains: ts } } });
  await prisma.procurementCategory.deleteMany({ where: { code: { contains: ts } } });
  await prisma.project.deleteMany({ where: { id: { in: [projectId, d4ProjectId] } } });
  await prisma.entity.deleteMany({ where: { id: entityId } });
  delete process.env.SEED_CONTEXT;
}, 60_000);

describe('PIC-101 — budget variance math (RED on main, GREEN after fix)', () => {
  it('D1: row variance = committed + actual − budget (the screenshot case → −4.1M, NOT +6.5M)', async () => {
    const summary = await getBudgetSummary(projectId);
    expect(summary).not.toBeNull();
    const rowA = summary!.lines.find((l) => l.categoryId === catAId)!;
    // CORRECT: 2.4M + 0 − 6.5M = −4.1M. Main produces budget − actual = +6.5M (the lie).
    expect(rowA.varianceAmount).toBe(A_COMMITTED + A_ACTUAL - A_BUDGET); // −4_100_000
  });

  it('D2: row remaining = budget − committed − actual (line B → 0.2M, NOT 0.5M)', async () => {
    const summary = await getBudgetSummary(projectId);
    const rowB = summary!.lines.find((l) => l.categoryId === catBId)!;
    // CORRECT: 1M − 0.5M − 0.3M = 0.2M. Main produces budget − committed = 0.5M (excludes actual).
    expect(rowB.remainingAmount).toBe(B_BUDGET - B_COMMITTED - B_ACTUAL); // 200_000
  });

  it('D3: summary remainingBudget = totalBudgeted − totalCommitted − totalActual (→ 4.3M, NOT 7.1M)', async () => {
    const summary = await getBudgetSummary(projectId);
    const totalBudgeted = A_BUDGET + B_BUDGET;       // 7.5M
    const totalCommitted = A_COMMITTED + B_COMMITTED; // 2.9M
    const totalActual = A_ACTUAL + B_ACTUAL;          // 0.3M
    // CORRECT: 7.5 − 2.9 − 0.3 = 4.3M. Main produces internalRevised − totalCommitted = 10 − 2.9 = 7.1M.
    expect(summary!.remainingBudget).toBe(totalBudgeted - totalCommitted - totalActual); // 4_300_000
  });

  it('D3-reconcile: Σ(row remaining) === summary.remainingBudget (rows reconcile to summary)', async () => {
    const summary = await getBudgetSummary(projectId);
    const rowSum = summary!.lines.reduce((acc, l) => acc + l.remainingAmount, 0);
    expect(rowSum).toBe(summary!.remainingBudget);
  });

  it('D3-variance-parity: summary.totalVariance === Σ(row variance) === −(remaining vs budget)', async () => {
    const summary = await getBudgetSummary(projectId);
    const rowVarSum = summary!.lines.reduce((acc, l) => acc + l.varianceAmount, 0);
    // totalVariance must exist on the summary payload (added by the fix) and reconcile.
    expect((summary as { totalVariance?: number }).totalVariance).toBe(rowVarSum);
    // committed + actual − budget at the portfolio grain
    const totalBudgeted = A_BUDGET + B_BUDGET;
    const totalCommitted = A_COMMITTED + B_COMMITTED;
    const totalActual = A_ACTUAL + B_ACTUAL;
    expect((summary as { totalVariance?: number }).totalVariance).toBe(totalCommitted + totalActual - totalBudgeted);
  });

  it('D4: SI absorption releases PO commitment — committed+actual must NOT double-count', async () => {
    // Place the PO commitment: committed 0 → 2.4M
    const poRes = await absorbPoCommitment(d4ProjectId, d4PoId, actor);
    expect(poRes.absorbed).toBe(true);
    const afterPo = await prisma.budgetLine.findUniqueOrThrow({ where: { id: d4BudgetLineId } });
    expect(afterPo.committedAmount.toString()).toBe(String(D4_PO_TOTAL)); // 2.4M committed

    // Land the SI against the PO: actual 0 → 2.4M, and commitment should RELEASE 0 ← 2.4M.
    const siRes = await absorbSupplierInvoiceActual(d4ProjectId, d4SiId, actor);
    expect(siRes.absorbed).toBe(true);
    const afterSi = await prisma.budgetLine.findUniqueOrThrow({ where: { id: d4BudgetLineId } });

    const committed = parseFloat(afterSi.committedAmount.toString());
    const actual = parseFloat(afterSi.actualAmount.toString());
    // CORRECT: actual = 2.4M, committed released to 0 → committed+actual = 2.4M (the real spend).
    // Main: actual = 2.4M, committed STAYS 2.4M → committed+actual = 4.8M (double-count).
    expect(actual).toBe(D4_SI_TOTAL);            // 2.4M actual (both main + fix)
    expect(committed).toBe(0);                    // RELEASED — main leaves it at 2.4M (RED)
    expect(committed + actual).toBe(D4_SI_TOTAL); // 2.4M, not 4.8M
  });
});
