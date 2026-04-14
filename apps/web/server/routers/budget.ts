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
import { router, projectProcedure } from '../trpc';

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
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (!ctx.user.permissions.includes('project.edit'))
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Insufficient permissions.' });
      return updateBudgetLine(
        { budgetLineId: input.budgetLineId, budgetAmount: input.budgetAmount, notes: input.notes },
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

  /** Query all open exceptions for a project (admin view). */
  openExceptions: projectProcedure
    .input(z.object({ projectId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      if (!ctx.user.permissions.includes('project.view'))
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Insufficient permissions.' });
      return prisma.budgetAbsorptionException.findMany({
        where: {
          projectId: input.projectId,
          status: 'open',
        },
        orderBy: { createdAt: 'desc' },
      });
    }),
});
