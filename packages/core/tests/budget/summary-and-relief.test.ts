/**
 * Budget summary formulas + absorption commitment relief — truth tests.
 *
 * These tests pin the Path A semantics agreed with Ahmed on 2026-04-21:
 *   Per line:
 *     remainingAmount = budget − committed − actual
 *     varianceAmount  = committed + actual − budget  (positive = over)
 *   Summary:
 *     remainingBudget = totalBudgeted − totalCommitted − totalActual
 *     totalVariance   = totalCommitted + totalActual − totalBudgeted
 *   Absorption:
 *     SI approval with a linked PO releases the PO commitment by the SI
 *     total (bounded at 0) so committed + actual stops double-counting.
 *
 * Includes the exact screenshot case that prompted the lane:
 *   Materials — budget 6.5M, committed 2.4M, actual 0
 *   Old variance column: 6.5M (the visible lie)
 *   New variance: −4.1M (under budget)
 *   New remaining: 4.1M (unchanged)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mock Prisma + audit (hoisted so vi.mock factories can reference them)
// ---------------------------------------------------------------------------

const { mockPrisma, mockAuditLog, mockPrismaNamespace } = vi.hoisted(() => {
  const mockAuditLog = vi.fn().mockResolvedValue({});
  const mockPrisma: Record<string, any> = {
    projectBudget: {
      findUnique: vi.fn(),
      findUniqueOrThrow: vi.fn(),
    },
    budgetLine: {
      findUnique: vi.fn(),
      findUniqueOrThrow: vi.fn(),
      update: vi.fn(),
    },
    supplierInvoice: { findUniqueOrThrow: vi.fn() },
    purchaseOrder: { findUniqueOrThrow: vi.fn() },
    procurementCategory: { findUnique: vi.fn() },
    budgetCategory: { findUnique: vi.fn() },
    budgetAbsorptionException: { create: vi.fn() },
  };
  mockPrisma.$transaction = vi
    .fn()
    .mockImplementation((cb: (tx: any) => any) => cb(mockPrisma));

  // Minimal Decimal shim compatible with the code paths under test.
  class Decimal {
    private v: string;
    constructor(v: string | number | Decimal) {
      this.v = typeof v === 'string' || typeof v === 'number' ? String(v) : v.toString();
    }
    toString(): string {
      return this.v;
    }
    plus(o: Decimal): Decimal {
      return new Decimal(parseFloat(this.v) + parseFloat(o.toString()));
    }
    minus(o: Decimal): Decimal {
      return new Decimal(parseFloat(this.v) - parseFloat(o.toString()));
    }
    lessThan(o: Decimal): boolean {
      return parseFloat(this.v) < parseFloat(o.toString());
    }
    isZero(): boolean {
      return parseFloat(this.v) === 0;
    }
    isNegative(): boolean {
      return parseFloat(this.v) < 0;
    }
  }
  const mockPrismaNamespace = { Decimal };
  return { mockPrisma, mockAuditLog, mockPrismaNamespace };
});

vi.mock('@fmksa/db', () => ({ prisma: mockPrisma, Prisma: mockPrismaNamespace }));
vi.mock('../../src/audit/service', () => ({
  auditService: { log: (...args: unknown[]) => mockAuditLog(...args) },
}));

// ---------------------------------------------------------------------------
// Import after mocks
// ---------------------------------------------------------------------------

import { getBudgetSummary } from '../../src/budget/service';
import {
  absorbSupplierInvoiceActual,
  reversePoCommitment,
} from '../../src/budget/absorption';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function budgetLine(overrides: Record<string, unknown> = {}) {
  return {
    id: 'line-id',
    categoryId: 'cat-id',
    category: { code: 'MAT', name: 'Materials', sortOrder: 1 },
    budgetAmount: '0',
    committedAmount: '0',
    actualAmount: '0',
    lastImportedAmount: null,
    importBatchId: null,
    importRowId: null,
    importedAt: null,
    importedByUserId: null,
    notes: null,
    ...overrides,
  };
}

function budgetFixture(lines: ReturnType<typeof budgetLine>[]) {
  return {
    id: 'budget-id',
    projectId: 'proj-id',
    internalBaseline: '10000000',
    internalRevised: '10000000',
    contingencyAmount: '500000',
    eiReserveTotal: '0',
    lines,
  };
}

// ---------------------------------------------------------------------------
// getBudgetSummary formula tests
// ---------------------------------------------------------------------------

describe('getBudgetSummary — Path A truth formulas', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('the screenshot case: Materials 6.5M / 2.4M / 0 → remaining 4.1M, variance −4.1M', async () => {
    mockPrisma.projectBudget.findUnique.mockResolvedValue(
      budgetFixture([
        budgetLine({
          id: 'line-mat',
          category: { code: 'MAT', name: 'Materials', sortOrder: 1 },
          budgetAmount: '6500000',
          committedAmount: '2400000',
          actualAmount: '0',
        }),
      ]),
    );

    const summary = await getBudgetSummary('proj-id');

    expect(summary).not.toBeNull();
    expect(summary!.lines).toHaveLength(1);
    const mat = summary!.lines[0]!;
    expect(mat.budgetAmount).toBe(6_500_000);
    expect(mat.committedAmount).toBe(2_400_000);
    expect(mat.actualAmount).toBe(0);
    // OLD: remaining 4.1M, variance 6.5M  (variance was a lie)
    // NEW: remaining 4.1M, variance −4.1M (under budget, coherent)
    expect(mat.remainingAmount).toBe(4_100_000);
    expect(mat.varianceAmount).toBe(-4_100_000);
  });

  it('over-budget line: variance is positive and equals −remaining', async () => {
    mockPrisma.projectBudget.findUnique.mockResolvedValue(
      budgetFixture([
        budgetLine({
          budgetAmount: '1000',
          committedAmount: '800',
          actualAmount: '400', // committed + actual = 1200 > 1000
        }),
      ]),
    );

    const summary = await getBudgetSummary('proj-id');
    const line = summary!.lines[0]!;
    expect(line.remainingAmount).toBe(-200);
    expect(line.varianceAmount).toBe(200);
    expect(line.varianceAmount).toBe(-line.remainingAmount);
  });

  it('summary totals reconcile with sum of row values', async () => {
    mockPrisma.projectBudget.findUnique.mockResolvedValue(
      budgetFixture([
        budgetLine({ id: 'a', budgetAmount: '1000', committedAmount: '300', actualAmount: '100' }),
        budgetLine({ id: 'b', budgetAmount: '2000', committedAmount: '500', actualAmount: '200' }),
        budgetLine({ id: 'c', budgetAmount: '500', committedAmount: '0', actualAmount: '0' }),
      ]),
    );

    const summary = await getBudgetSummary('proj-id');
    expect(summary!.totalBudgeted).toBe(3500);
    expect(summary!.totalCommitted).toBe(800);
    expect(summary!.totalActual).toBe(300);
    // Remaining = 3500 − 800 − 300 = 2400
    expect(summary!.remainingBudget).toBe(2400);
    // Variance = 800 + 300 − 3500 = −2400
    expect(summary!.totalVariance).toBe(-2400);
    // Sum of row remainings must equal summary remaining
    const rowRemainingSum = summary!.lines.reduce((a, l) => a + l.remainingAmount, 0);
    expect(rowRemainingSum).toBe(summary!.remainingBudget);
  });

  it('returns null when no budget exists', async () => {
    mockPrisma.projectBudget.findUnique.mockResolvedValue(null);
    const summary = await getBudgetSummary('proj-id');
    expect(summary).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// absorbSupplierInvoiceActual — commitment relief tests
// ---------------------------------------------------------------------------

describe('absorbSupplierInvoiceActual — commitment relief', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function wireResolvers(budgetLineRecord: {
    id: string;
    committedAmount: string;
    actualAmount: string;
  }) {
    // resolveBudgetLine path: findUnique for projectBudget → procurementCategory
    // → budgetCategory → budgetLine (compound unique).
    mockPrisma.projectBudget.findUnique.mockResolvedValue({ id: 'budget-id' });
    mockPrisma.procurementCategory.findUnique.mockResolvedValue({ code: 'MAT' });
    mockPrisma.budgetCategory.findUnique.mockResolvedValue({ id: 'cat-id' });
    mockPrisma.budgetLine.findUnique.mockResolvedValue({
      id: budgetLineRecord.id,
      committedAmount: new mockPrismaNamespace.Decimal(budgetLineRecord.committedAmount),
      actualAmount: new mockPrismaNamespace.Decimal(budgetLineRecord.actualAmount),
    });
    // Inside releaseCommitmentBounded: findUniqueOrThrow on budgetLine for
    // current committed amount.
    mockPrisma.budgetLine.findUniqueOrThrow.mockResolvedValue({
      committedAmount: new mockPrismaNamespace.Decimal(budgetLineRecord.committedAmount),
    });
    mockPrisma.budgetLine.update.mockResolvedValue({});
  }

  it('SI with PO link: increments actual AND releases commitment by SI total', async () => {
    mockPrisma.supplierInvoice.findUniqueOrThrow.mockResolvedValue({
      id: 'si-1',
      categoryId: 'proc-cat-id',
      totalAmount: new mockPrismaNamespace.Decimal('100'),
      purchaseOrder: { categoryId: 'proc-cat-id' },
    });
    wireResolvers({ id: 'line-mat', committedAmount: '100', actualAmount: '0' });

    const result = await absorbSupplierInvoiceActual('proj-id', 'si-1', 'actor');

    expect(result.absorbed).toBe(true);
    // Two updates expected: (1) actual increment, (2) commitment relief
    const updates = mockPrisma.budgetLine.update.mock.calls;
    expect(updates.length).toBe(2);

    const actualCall = updates.find((c: any[]) => c[0].data.actualAmount);
    const reliefCall = updates.find((c: any[]) => c[0].data.committedAmount);
    expect(actualCall).toBeDefined();
    expect(reliefCall).toBeDefined();
    expect(actualCall![0].data.actualAmount.increment.toString()).toBe('100');
    expect(reliefCall![0].data.committedAmount.decrement.toString()).toBe('100');
  });

  it('SI without PO: increments actual, NO commitment relief', async () => {
    mockPrisma.supplierInvoice.findUniqueOrThrow.mockResolvedValue({
      id: 'si-direct',
      categoryId: 'proc-cat-id',
      totalAmount: new mockPrismaNamespace.Decimal('50'),
      purchaseOrder: null,
    });
    wireResolvers({ id: 'line-mat', committedAmount: '0', actualAmount: '0' });

    const result = await absorbSupplierInvoiceActual('proj-id', 'si-direct', 'actor');

    expect(result.absorbed).toBe(true);
    const updates = mockPrisma.budgetLine.update.mock.calls;
    // Only actual increment — no relief when no PO to relieve.
    expect(updates.length).toBe(1);
    expect(updates[0]![0].data.actualAmount.increment.toString()).toBe('50');
  });

  it('SI total exceeds line committed: relief bounded at 0 (no negative commitment)', async () => {
    mockPrisma.supplierInvoice.findUniqueOrThrow.mockResolvedValue({
      id: 'si-over',
      categoryId: 'proc-cat-id',
      totalAmount: new mockPrismaNamespace.Decimal('150'), // SI > PO commitment
      purchaseOrder: { categoryId: 'proc-cat-id' },
    });
    wireResolvers({ id: 'line-mat', committedAmount: '100', actualAmount: '0' });

    await absorbSupplierInvoiceActual('proj-id', 'si-over', 'actor');

    const reliefCall = mockPrisma.budgetLine.update.mock.calls.find(
      (c: any[]) => c[0].data.committedAmount,
    );
    // Released only 100 (the current committed), not 150
    expect(reliefCall![0].data.committedAmount.decrement.toString()).toBe('100');
  });
});

// ---------------------------------------------------------------------------
// reversePoCommitment — bounded at zero
// ---------------------------------------------------------------------------

describe('reversePoCommitment — bounded relief', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('partially-invoiced PO: reversal only releases the residual, never goes negative', async () => {
    mockPrisma.purchaseOrder.findUniqueOrThrow.mockResolvedValue({
      id: 'po-1',
      categoryId: 'proc-cat-id',
      totalAmount: new mockPrismaNamespace.Decimal('200'),
    });
    // resolveBudgetLine wiring
    mockPrisma.projectBudget.findUnique.mockResolvedValue({ id: 'budget-id' });
    mockPrisma.procurementCategory.findUnique.mockResolvedValue({ code: 'MAT' });
    mockPrisma.budgetCategory.findUnique.mockResolvedValue({ id: 'cat-id' });
    mockPrisma.budgetLine.findUnique.mockResolvedValue({
      id: 'line-mat',
      committedAmount: new mockPrismaNamespace.Decimal('50'), // already partially released
      actualAmount: new mockPrismaNamespace.Decimal('150'),
    });
    // Bounded helper reads current via findUniqueOrThrow
    mockPrisma.budgetLine.findUniqueOrThrow.mockResolvedValue({
      committedAmount: new mockPrismaNamespace.Decimal('50'),
    });
    mockPrisma.budgetLine.update.mockResolvedValue({});

    const result = await reversePoCommitment('proj-id', 'po-1', 'actor');

    expect(result.absorbed).toBe(true);
    if (result.absorbed) {
      // Released 50 (the residual), not the full 200
      expect(result.amount).toBe('50');
    }
    const reliefCall = mockPrisma.budgetLine.update.mock.calls.find(
      (c: any[]) => c[0].data.committedAmount,
    );
    expect(reliefCall![0].data.committedAmount.decrement.toString()).toBe('50');
  });
});
