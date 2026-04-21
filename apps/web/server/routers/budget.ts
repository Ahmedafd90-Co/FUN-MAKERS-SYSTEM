/**
 * Internal Budget tRPC router.
 *
 * Manages the internal project budget — separate from the external contract value.
 * Budget operations require project.edit permission.
 */
import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { prisma } from '@fmksa/db';
import {
  getBudget,
  createBudget,
  updateBudget,
  updateBudgetLine,
  recordAdjustment,
  getBudgetSummary,
} from '@fmksa/core';
import { router, projectProcedure, protectedProcedure } from '../trpc';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function hasPerm(ctx: { user: { permissions: string[] } }, perm: string): boolean {
  return ctx.user.permissions.includes('system.admin') || ctx.user.permissions.includes(perm);
}

export const budgetRouter = router({
  get: projectProcedure
    .input(z.object({ projectId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      if (!ctx.user.permissions.includes('project.view'))
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Insufficient permissions.' });
      return getBudget(input.projectId);
    }),

  summary: projectProcedure
    .input(z.object({ projectId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      if (!ctx.user.permissions.includes('project.view'))
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Insufficient permissions.' });
      return getBudgetSummary(input.projectId);
    }),

  create: projectProcedure
    .input(
      z.object({
        projectId: z.string().uuid(),
        internalBaseline: z.number().positive(),
        contingencyAmount: z.number().min(0).optional(),
        notes: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (!ctx.user.permissions.includes('project.edit'))
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Insufficient permissions.' });
      return createBudget(input, ctx.user.id);
    }),

  update: projectProcedure
    .input(
      z.object({
        projectId: z.string().uuid(),
        internalRevised: z.number().positive().optional(),
        contingencyAmount: z.number().min(0).optional(),
        notes: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (!ctx.user.permissions.includes('project.edit'))
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Insufficient permissions.' });
      return updateBudget(input, ctx.user.id);
    }),

  updateLine: projectProcedure
    .input(
      z.object({
        projectId: z.string().uuid(),
        budgetLineId: z.string().uuid(),
        budgetAmount: z.number().min(0),
        notes: z.string().optional(),
        // Optional operator-supplied rationale. When present, it becomes the
        // BudgetAdjustment.reason written by updateBudgetLine. UI surfaces
        // this when editing imported lines so the drift history is legible.
        reason: z.string().max(500).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (!ctx.user.permissions.includes('project.edit'))
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Insufficient permissions.' });
      return updateBudgetLine(
        {
          budgetLineId: input.budgetLineId,
          budgetAmount: input.budgetAmount,
          notes: input.notes,
          reason: input.reason,
        },
        ctx.user.id,
      );
    }),

  recordAdjustment: projectProcedure
    .input(
      z.object({
        projectId: z.string().uuid(),
        adjustmentType: z.enum([
          'baseline_change',
          'contingency_change',
          'ei_reserve_change',
          'reallocation',
        ]),
        amount: z.number(),
        reason: z.string().min(1),
        approvedBy: z.string().uuid().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (!ctx.user.permissions.includes('project.edit'))
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Insufficient permissions.' });
      return recordAdjustment(input, ctx.user.id);
    }),

  /** Query absorption exceptions for a specific source record. */
  exceptions: projectProcedure
    .input(z.object({
      projectId: z.string().uuid(),
      sourceRecordType: z.string(),
      sourceRecordId: z.string().uuid(),
    }))
    .query(async ({ ctx, input }) => {
      if (!ctx.user.permissions.includes('project.view'))
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Insufficient permissions.' });
      return prisma.budgetAbsorptionException.findMany({
        where: {
          projectId: input.projectId,
          sourceRecordType: input.sourceRecordType,
          sourceRecordId: input.sourceRecordId,
        },
        orderBy: { createdAt: 'desc' },
      });
    }),

  /**
   * Query all open exceptions for a project.
   *
   * Path β (2026-04-21): amount + category are stored directly on the
   * exception row (`sourceAmount`, `categoryCode`) by the absorbers at
   * failure time — no fragile late-binding source-record lookup. We only
   * enrich with `categoryName` for display, resolved from the `travel`/
   * `materials`/etc. code via BudgetCategory.
   *
   * `sourceAmount` is stringified so Decimal round-trips cleanly through
   * tRPC (which serializes to JSON). The banner parses it back and treats
   * null as "unknown — do not sum into the totals".
   */
  openExceptions: projectProcedure
    .input(z.object({ projectId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      if (!ctx.user.permissions.includes('project.view'))
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Insufficient permissions.' });

      const exceptions = await prisma.budgetAbsorptionException.findMany({
        where: {
          projectId: input.projectId,
          status: 'open',
        },
        orderBy: { createdAt: 'desc' },
      });

      if (exceptions.length === 0) return [];

      // Batch-resolve BudgetCategory names for the codes we have.
      const codes = Array.from(
        new Set(
          exceptions
            .map((e) => e.categoryCode)
            .filter((c): c is string => !!c),
        ),
      );
      const budgetCats =
        codes.length > 0
          ? await prisma.budgetCategory.findMany({
              where: { code: { in: codes } },
              select: { code: true, name: true },
            })
          : [];
      const nameByCode = new Map(budgetCats.map((c) => [c.code, c.name]));

      return exceptions.map((ex) => ({
        ...ex,
        sourceAmount: ex.sourceAmount?.toString() ?? null,
        // categoryCode stays as-is from the column
        categoryName: ex.categoryCode ? nameByCode.get(ex.categoryCode) ?? null : null,
      }));
    }),

  /**
   * Cross-project absorption exceptions — admin surface.
   * Paginated with filters by project, module, absorption type, severity, status.
   */
  allExceptions: protectedProcedure
    .input(z.object({
      projectId: z.string().uuid().optional(),
      sourceModule: z.string().optional(),
      absorptionType: z.string().optional(),
      severity: z.string().optional(),
      status: z.enum(['open', 'resolved']).optional(),
      skip: z.number().int().min(0).default(0),
      take: z.number().int().min(1).max(100).default(25),
    }).optional())
    .query(async ({ ctx, input }) => {
      if (!hasPerm(ctx, 'posting.view'))
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Insufficient permissions.' });

      const where: Record<string, unknown> = {};
      if (input?.projectId) where.projectId = input.projectId;
      if (input?.sourceModule) where.sourceModule = input.sourceModule;
      if (input?.absorptionType) where.absorptionType = input.absorptionType;
      if (input?.severity) where.severity = input.severity;
      if (input?.status) where.status = input.status;

      const [exceptions, total] = await Promise.all([
        prisma.budgetAbsorptionException.findMany({
          where,
          include: {
            project: { select: { id: true, code: true, name: true } },
          },
          orderBy: { createdAt: 'desc' },
          skip: input?.skip ?? 0,
          take: input?.take ?? 25,
        }),
        prisma.budgetAbsorptionException.count({ where }),
      ]);

      return { exceptions, total };
    }),

  /**
   * Get a single absorption exception by ID, enriched for the admin detail
   * sheet. Adds:
   *   - `categoryName`       — resolved from the stored categoryCode via
   *                            BudgetCategory (null when no code is stamped
   *                            or the code has no matching BudgetCategory).
   *   - `sourceRecordExists` — whether the source record (PO / SI / Expense /
   *                            CN) still exists by id. The detail sheet uses
   *                            this to avoid showing a clickable link that
   *                            404s (demo placeholder ids, deleted records).
   *
   * `sourceAmount` is stringified so Decimal round-trips cleanly through tRPC.
   */
  exceptionDetail: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      if (!hasPerm(ctx, 'posting.view'))
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Insufficient permissions.' });

      const exception = await prisma.budgetAbsorptionException.findUnique({
        where: { id: input.id },
        include: {
          project: { select: { id: true, code: true, name: true } },
        },
      });

      if (!exception) throw new TRPCError({ code: 'NOT_FOUND', message: 'Exception not found.' });

      // Category name — cheap single lookup.
      let categoryName: string | null = null;
      if (exception.categoryCode) {
        const cat = await prisma.budgetCategory.findUnique({
          where: { code: exception.categoryCode },
          select: { name: true },
        });
        categoryName = cat?.name ?? null;
      }

      // Source-record existence — one lookup keyed on the source type.
      let sourceRecordExists = false;
      try {
        switch (exception.sourceRecordType) {
          case 'purchase_order':
            sourceRecordExists = !!(await prisma.purchaseOrder.findUnique({
              where: { id: exception.sourceRecordId },
              select: { id: true },
            }));
            break;
          case 'supplier_invoice':
            sourceRecordExists = !!(await prisma.supplierInvoice.findUnique({
              where: { id: exception.sourceRecordId },
              select: { id: true },
            }));
            break;
          case 'expense':
            sourceRecordExists = !!(await prisma.expense.findUnique({
              where: { id: exception.sourceRecordId },
              select: { id: true },
            }));
            break;
          case 'credit_note':
            sourceRecordExists = !!(await prisma.creditNote.findUnique({
              where: { id: exception.sourceRecordId },
              select: { id: true },
            }));
            break;
          default:
            sourceRecordExists = false;
        }
      } catch {
        // Unknown source type or malformed id — treat as non-existent; UI
        // renders the record reference as plain text with a note.
        sourceRecordExists = false;
      }

      return {
        ...exception,
        sourceAmount: exception.sourceAmount?.toString() ?? null,
        categoryName,
        sourceRecordExists,
      };
    }),

  /** Resolve an absorption exception manually. */
  resolveException: protectedProcedure
    .input(z.object({
      id: z.string().uuid(),
      note: z.string().min(1, 'Resolution note is required.'),
    }))
    .mutation(async ({ ctx, input }) => {
      if (!hasPerm(ctx, 'posting.view'))
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Insufficient permissions.' });

      const exception = await prisma.budgetAbsorptionException.findUnique({
        where: { id: input.id },
      });

      if (!exception) throw new TRPCError({ code: 'NOT_FOUND', message: 'Exception not found.' });
      if (exception.status === 'resolved')
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Exception already resolved.' });

      return prisma.budgetAbsorptionException.update({
        where: { id: input.id },
        data: {
          status: 'resolved',
          resolutionNote: input.note,
          resolvedAt: new Date(),
          resolvedBy: ctx.user.id,
        },
      });
    }),
});
