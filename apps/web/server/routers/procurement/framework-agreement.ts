/**
 * FrameworkAgreement tRPC sub-router — entity-scoped.
 *
 * Framework agreements are entity-level master data (optional projectId).
 * Uses entityProcedure for union-aggregated entity permissions.
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
import { router, entityProcedure } from '../../trpc';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function hasEntityPerm(ctx: { entityPermissions: string[] }, perm: string): boolean {
  return ctx.entityPermissions.includes('system.admin') || ctx.entityPermissions.includes(perm);
}

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

export const frameworkAgreementRouter = router({
  list: entityProcedure
    .input(EntityListFilterInputSchema)
    .query(async ({ ctx, input }) => {
      if (!hasEntityPerm(ctx, 'framework_agreement.list'))
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Insufficient permissions.' });
      return listFrameworkAgreements(input);
    }),

  get: entityProcedure
    .input(z.object({ entityId: z.string().uuid(), id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      if (!hasEntityPerm(ctx, 'framework_agreement.view'))
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Insufficient permissions.' });
      try {
        return await getFrameworkAgreement(input.id, input.entityId);
      } catch (err) {
        mapError(err);
      }
    }),

  create: entityProcedure
    .input(CreateFrameworkAgreementInputSchema)
    .mutation(async ({ ctx, input }) => {
      if (!hasEntityPerm(ctx, 'framework_agreement.create'))
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Insufficient permissions.' });
      try {
        return await createFrameworkAgreement(input, ctx.user.id);
      } catch (err) {
        mapError(err);
      }
    }),

  update: entityProcedure
    .input(UpdateFrameworkAgreementInputSchema.extend({ entityId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      if (!hasEntityPerm(ctx, 'framework_agreement.update'))
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Insufficient permissions.' });
      try {
        return await updateFrameworkAgreement(input, ctx.user.id, input.entityId);
      } catch (err) {
        mapError(err);
      }
    }),

  transition: entityProcedure
    .input(z.object({
      entityId: z.string().uuid(),
      id: z.string().uuid(),
      action: z.string(),
      comment: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      if (!hasEntityPerm(ctx, 'framework_agreement.transition'))
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Insufficient permissions.' });
      try {
        return await transitionFrameworkAgreement(input.id, input.action, ctx.user.id, input.comment, input.entityId);
      } catch (err) {
        mapError(err);
      }
    }),

  delete: entityProcedure
    .input(z.object({ entityId: z.string().uuid(), id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      if (!hasEntityPerm(ctx, 'framework_agreement.delete'))
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Insufficient permissions.' });
      try {
        await deleteFrameworkAgreement(input.id, ctx.user.id, input.entityId);
        return { success: true };
      } catch (err) {
        mapError(err);
      }
    }),

  utilization: entityProcedure
    .input(z.object({ entityId: z.string().uuid(), id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      if (!hasEntityPerm(ctx, 'framework_agreement.view'))
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Insufficient permissions.' });
      try {
        return await getUtilization(input.id, input.entityId);
      } catch (err) {
        mapError(err);
      }
    }),
});
