/**
 * Quotation tRPC sub-router — project-scoped.
 *
 * Phase 5, Task 5.6 — Module 3 Procurement Engine.
 */
import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import {
  CreateQuotationInputSchema,
  UpdateQuotationInputSchema,
} from '@fmksa/contracts';
import {
  createQuotation,
  updateQuotation,
  transitionQuotation,
  getQuotation,
  listQuotations,
  deleteQuotation,
  compareQuotations,
} from '@fmksa/core';
import { router, projectProcedure } from '../../trpc';

// ---------------------------------------------------------------------------
// Error mapping helper
// ---------------------------------------------------------------------------

function mapError(err: unknown): never {
  if (err instanceof Error) {
    if (err.message.includes('not found') || err.message.includes('findUniqueOrThrow'))
      throw new TRPCError({ code: 'NOT_FOUND', message: err.message });
    if (err.message.includes('Cannot') || err.message.includes('Invalid') || err.message.includes('Unknown'))
      throw new TRPCError({ code: 'BAD_REQUEST', message: err.message });
  }
  throw err;
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

export const quotationRouter = router({
  list: projectProcedure
    .input(z.object({
      projectId: z.string().uuid(),
      rfqId: z.string().uuid().optional(),
      vendorId: z.string().uuid().optional(),
      status: z.array(z.string()).optional(),
      skip: z.number().int().min(0).default(0),
      take: z.number().int().min(1).max(100).default(20),
      sortField: z.string().optional(),
      sortDirection: z.enum(['asc', 'desc']).default('desc'),
    }))
    .query(async ({ ctx, input }) => {
      if (!ctx.user.permissions.includes('quotation.list'))
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Insufficient permissions.' });
      return listQuotations(input);
    }),

  get: projectProcedure
    .input(z.object({ projectId: z.string().uuid(), id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      if (!ctx.user.permissions.includes('quotation.view'))
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Insufficient permissions.' });
      try {
        return await getQuotation(input.id);
      } catch (err) {
        mapError(err);
      }
    }),

  create: projectProcedure
    .input(CreateQuotationInputSchema)
    .mutation(async ({ ctx, input }) => {
      if (!ctx.user.permissions.includes('quotation.create'))
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Insufficient permissions.' });
      try {
        return await createQuotation(input, ctx.user.id);
      } catch (err) {
        mapError(err);
      }
    }),

  update: projectProcedure
    .input(UpdateQuotationInputSchema.extend({ projectId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      if (!ctx.user.permissions.includes('quotation.update'))
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Insufficient permissions.' });
      try {
        return await updateQuotation(input, ctx.user.id);
      } catch (err) {
        mapError(err);
      }
    }),

  transition: projectProcedure
    .input(z.object({
      projectId: z.string().uuid(),
      id: z.string().uuid(),
      action: z.string(),
      comment: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      if (!ctx.user.permissions.includes('quotation.transition'))
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Insufficient permissions.' });
      try {
        return await transitionQuotation(input.id, input.action, ctx.user.id, input.comment);
      } catch (err) {
        mapError(err);
      }
    }),

  delete: projectProcedure
    .input(z.object({ projectId: z.string().uuid(), id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      if (!ctx.user.permissions.includes('quotation.delete'))
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Insufficient permissions.' });
      try {
        await deleteQuotation(input.id, ctx.user.id);
        return { success: true };
      } catch (err) {
        mapError(err);
      }
    }),

  compare: projectProcedure
    .input(z.object({ projectId: z.string().uuid(), rfqId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      if (!ctx.user.permissions.includes('quotation.view'))
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Insufficient permissions.' });
      try {
        return await compareQuotations(input.rfqId);
      } catch (err) {
        mapError(err);
      }
    }),
});
