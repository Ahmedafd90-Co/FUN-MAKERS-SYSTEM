/**
 * FrameworkAgreement tRPC sub-router — project-scoped.
 *
 * Phase 5, Task 5.5 — Module 3 Procurement Engine.
 */
import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import {
  CreateFrameworkAgreementInputSchema,
  UpdateFrameworkAgreementInputSchema,
  EntityListFilterInputSchema,
} from '@fmksa/contracts';
import {
  createFrameworkAgreement,
  updateFrameworkAgreement,
  transitionFrameworkAgreement,
  getFrameworkAgreement,
  listFrameworkAgreements,
  deleteFrameworkAgreement,
  getUtilization,
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

export const frameworkAgreementRouter = router({
  list: projectProcedure
    .input(EntityListFilterInputSchema.extend({ projectId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      if (!ctx.user.permissions.includes('framework_agreement.list'))
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Insufficient permissions.' });
      return listFrameworkAgreements(input);
    }),

  get: projectProcedure
    .input(z.object({ projectId: z.string().uuid(), id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      if (!ctx.user.permissions.includes('framework_agreement.view'))
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Insufficient permissions.' });
      try {
        return await getFrameworkAgreement(input.id);
      } catch (err) {
        mapError(err);
      }
    }),

  create: projectProcedure
    .input(CreateFrameworkAgreementInputSchema.extend({ projectId: z.string().uuid().optional() }))
    .mutation(async ({ ctx, input }) => {
      if (!ctx.user.permissions.includes('framework_agreement.create'))
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Insufficient permissions.' });
      try {
        return await createFrameworkAgreement(input, ctx.user.id);
      } catch (err) {
        mapError(err);
      }
    }),

  update: projectProcedure
    .input(UpdateFrameworkAgreementInputSchema.extend({ projectId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      if (!ctx.user.permissions.includes('framework_agreement.update'))
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Insufficient permissions.' });
      try {
        return await updateFrameworkAgreement(input, ctx.user.id);
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
      if (!ctx.user.permissions.includes('framework_agreement.transition'))
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Insufficient permissions.' });
      try {
        return await transitionFrameworkAgreement(input.id, input.action, ctx.user.id, input.comment);
      } catch (err) {
        mapError(err);
      }
    }),

  delete: projectProcedure
    .input(z.object({ projectId: z.string().uuid(), id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      if (!ctx.user.permissions.includes('framework_agreement.delete'))
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Insufficient permissions.' });
      try {
        await deleteFrameworkAgreement(input.id, ctx.user.id);
        return { success: true };
      } catch (err) {
        mapError(err);
      }
    }),

  utilization: projectProcedure
    .input(z.object({ projectId: z.string().uuid(), id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      if (!ctx.user.permissions.includes('framework_agreement.view'))
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Insufficient permissions.' });
      try {
        return await getUtilization(input.id);
      } catch (err) {
        mapError(err);
      }
    }),
});
