/**
 * RFQ tRPC sub-router — project-scoped.
 *
 * Phase 5, Task 5.6 — Module 3 Procurement Engine.
 */
import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import {
  CreateRfqInputSchema,
  UpdateRfqInputSchema,
  ProcurementListFilterInputSchema,
} from '@fmksa/contracts';
import {
  createRfq,
  updateRfq,
  transitionRfq,
  getRfq,
  listRfqs,
  deleteRfq,
  inviteVendors,
} from '@fmksa/core';
import { router, projectProcedure } from '../../trpc';

// ---------------------------------------------------------------------------
// Error mapping helper
// ---------------------------------------------------------------------------

function mapError(err: unknown): never {
  if (err instanceof Error) {
    if (err.message.includes('does not belong to the expected'))
      throw new TRPCError({ code: 'NOT_FOUND', message: err.message });
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

export const rfqRouter = router({
  list: projectProcedure
    .input(ProcurementListFilterInputSchema)
    .query(async ({ ctx, input }) => {
      if (!ctx.user.permissions.includes('rfq.list'))
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Insufficient permissions.' });
      return listRfqs(input);
    }),

  get: projectProcedure
    .input(z.object({ projectId: z.string().uuid(), id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      if (!ctx.user.permissions.includes('rfq.view'))
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Insufficient permissions.' });
      try {
        return await getRfq(input.id, input.projectId);
      } catch (err) {
        mapError(err);
      }
    }),

  create: projectProcedure
    .input(CreateRfqInputSchema)
    .mutation(async ({ ctx, input }) => {
      if (!ctx.user.permissions.includes('rfq.create'))
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Insufficient permissions.' });
      try {
        return await createRfq(input, ctx.user.id);
      } catch (err) {
        mapError(err);
      }
    }),

  update: projectProcedure
    .input(UpdateRfqInputSchema.extend({ projectId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      if (!ctx.user.permissions.includes('rfq.update'))
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Insufficient permissions.' });
      try {
        return await updateRfq(input, ctx.user.id, input.projectId);
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
      if (!ctx.user.permissions.includes('rfq.transition'))
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Insufficient permissions.' });
      try {
        return await transitionRfq(input.id, input.action, ctx.user.id, input.comment, input.projectId);
      } catch (err) {
        mapError(err);
      }
    }),

  delete: projectProcedure
    .input(z.object({ projectId: z.string().uuid(), id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      if (!ctx.user.permissions.includes('rfq.delete'))
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Insufficient permissions.' });
      try {
        await deleteRfq(input.id, ctx.user.id, input.projectId);
        return { success: true };
      } catch (err) {
        mapError(err);
      }
    }),

  inviteVendors: projectProcedure
    .input(z.object({
      projectId: z.string().uuid(),
      rfqId: z.string().uuid(),
      vendorIds: z.array(z.string().uuid()).min(1),
    }))
    .mutation(async ({ ctx, input }) => {
      if (!ctx.user.permissions.includes('rfq.update'))
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Insufficient permissions.' });
      try {
        return await inviteVendors(input.rfqId, input.vendorIds, ctx.user.id, input.projectId);
      } catch (err) {
        mapError(err);
      }
    }),
});
