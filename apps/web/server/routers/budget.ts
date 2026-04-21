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
   * Query all open exceptions for a project, enriched with the source
   * record's amount and the resolved budget-category code/name when available.
   *
   * The Budget page banner uses these fields to show:
   *   - total unresolved amount currently NOT reflected in the summary totals
   *   - which categories are affected
   *
   * Source amount resolution walks sourceRecordType → fetches the record →
   * reads its total. Category resolution falls back through SI → SI.PO → PO
   * when a direct categoryId isn't present, matching the absorption
   * fallback chain in packages/core/src/budget/absorption.ts.
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

      // Collect IDs by source type for batched lookups.
      const poIds = new Set<string>();
      const siIds = new Set<string>();
      const expIds = new Set<string>();
      const cnIds = new Set<string>();
      for (const ex of exceptions) {
        if (ex.sourceRecordType === 'purchase_order') poIds.add(ex.sourceRecordId);
        else if (ex.sourceRecordType === 'supplier_invoice') siIds.add(ex.sourceRecordId);
        else if (ex.sourceRecordType === 'expense') expIds.add(ex.sourceRecordId);
        else if (ex.sourceRecordType === 'credit_note') cnIds.add(ex.sourceRecordId);
      }

      const [pos, sis, expenses, cns] = await Promise.all([
        poIds.size
          ? prisma.purchaseOrder.findMany({
              where: { id: { in: Array.from(poIds) } },
              select: { id: true, totalAmount: true, categoryId: true },
            })
          : Promise.resolve([]),
        siIds.size
          ? prisma.supplierInvoice.findMany({
              where: { id: { in: Array.from(siIds) } },
              select: {
                id: true,
                totalAmount: true,
                categoryId: true,
                purchaseOrder: { select: { categoryId: true } },
              },
            })
          : Promise.resolve([]),
        expIds.size
          ? prisma.expense.findMany({
              where: { id: { in: Array.from(expIds) } },
              select: { id: true, amount: true, categoryId: true },
            })
          : Promise.resolve([]),
        cnIds.size
          ? prisma.creditNote.findMany({
              where: { id: { in: Array.from(cnIds) } },
              select: {
                id: true,
                amount: true,
                supplierInvoice: {
                  select: {
                    categoryId: true,
                    purchaseOrder: { select: { categoryId: true } },
                  },
                },
                purchaseOrder: { select: { categoryId: true } },
              },
            })
          : Promise.resolve([]),
      ]);

      const poMap = new Map(pos.map((p) => [p.id, p]));
      const siMap = new Map(sis.map((s) => [s.id, s]));
      const expMap = new Map(expenses.map((e) => [e.id, e]));
      const cnMap = new Map(cns.map((c) => [c.id, c]));

      // Resolve unique procurement category IDs → budget category code/name via
      // the procurement-category.code == budget-category.code contract.
      const procCatIds = new Set<string>();
      const pushProcCat = (id: string | null | undefined) => {
        if (id) procCatIds.add(id);
      };
      for (const ex of exceptions) {
        if (ex.sourceRecordType === 'purchase_order') {
          pushProcCat(poMap.get(ex.sourceRecordId)?.categoryId);
        } else if (ex.sourceRecordType === 'supplier_invoice') {
          const si = siMap.get(ex.sourceRecordId);
          pushProcCat(si?.categoryId ?? si?.purchaseOrder?.categoryId ?? null);
        } else if (ex.sourceRecordType === 'expense') {
          pushProcCat(expMap.get(ex.sourceRecordId)?.categoryId);
        } else if (ex.sourceRecordType === 'credit_note') {
          const cn = cnMap.get(ex.sourceRecordId);
          pushProcCat(
            cn?.supplierInvoice?.categoryId ??
              cn?.supplierInvoice?.purchaseOrder?.categoryId ??
              cn?.purchaseOrder?.categoryId ??
              null,
          );
        }
      }

      let procCatByIdToCode = new Map<string, string>();
      let budgetCatByCode = new Map<string, { code: string; name: string }>();
      if (procCatIds.size > 0) {
        const procCats = await prisma.procurementCategory.findMany({
          where: { id: { in: Array.from(procCatIds) } },
          select: { id: true, code: true },
        });
        procCatByIdToCode = new Map(procCats.map((c) => [c.id, c.code]));
        if (procCats.length > 0) {
          const codes = Array.from(new Set(procCats.map((c) => c.code)));
          const budgetCats = await prisma.budgetCategory.findMany({
            where: { code: { in: codes } },
            select: { code: true, name: true },
          });
          budgetCatByCode = new Map(budgetCats.map((c) => [c.code, c]));
        }
      }

      return exceptions.map((ex) => {
        let amount: string | null = null;
        let procCategoryId: string | null = null;

        if (ex.sourceRecordType === 'purchase_order') {
          const po = poMap.get(ex.sourceRecordId);
          if (po) {
            amount = po.totalAmount.toString();
            procCategoryId = po.categoryId ?? null;
          }
        } else if (ex.sourceRecordType === 'supplier_invoice') {
          const si = siMap.get(ex.sourceRecordId);
          if (si) {
            amount = si.totalAmount.toString();
            procCategoryId = si.categoryId ?? si.purchaseOrder?.categoryId ?? null;
          }
        } else if (ex.sourceRecordType === 'expense') {
          const e = expMap.get(ex.sourceRecordId);
          if (e) {
            amount = e.amount.toString();
            procCategoryId = e.categoryId ?? null;
          }
        } else if (ex.sourceRecordType === 'credit_note') {
          const cn = cnMap.get(ex.sourceRecordId);
          if (cn) {
            amount = cn.amount.toString();
            procCategoryId =
              cn.supplierInvoice?.categoryId ??
              cn.supplierInvoice?.purchaseOrder?.categoryId ??
              cn.purchaseOrder?.categoryId ??
              null;
          }
        }

        const code = procCategoryId ? procCatByIdToCode.get(procCategoryId) ?? null : null;
        const budgetCat = code ? budgetCatByCode.get(code) ?? null : null;

        return {
          ...ex,
          sourceAmount: amount,
          categoryCode: code,
          categoryName: budgetCat?.name ?? null,
        };
      });
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

  /** Get a single absorption exception by ID. */
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
      return exception;
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
