/**
 * PrimeContract tRPC sub-router — project-scoped, 1:1 with Project.
 *
 * Layer 1 — PR-A2 (PIC-13).
 *
 * 5 endpoints + myPermissions, all gated by prime_contract.* permissions.
 * Transition action verb is typed via z.enum (compile-time safe — invalid
 * actions caught before reaching the service-layer state machine).
 *
 * Permission check on transition uses getTransitionPermission (from
 * _helpers.ts → getLayer1ActionPermission) to resolve to the specific
 * sign / activate / complete / terminate / cancel permission code.
 */
import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import {
  CreatePrimeContractInputSchema,
  UpdatePrimeContractInputSchema,
} from '@fmksa/contracts';
import {
  createPrimeContract,
  getPrimeContract,
  updatePrimeContract,
  transitionPrimeContractStatus,
  deletePrimeContract,
} from '@fmksa/core';
import { router, projectProcedure, protectedProcedure } from '../../trpc';
import { mapError, hasPerm, getTransitionPermission } from './_helpers';

// Action verbs enumerated for compile-time safety. Service-layer state machine
// is the canonical source of allowed transitions; this enum prevents typos at
// the boundary.
const PrimeContractActionEnum = z.enum([
  'sign',
  'activate',
  'complete',
  'terminate',
  'cancel',
]);

export const primeContractRouter = router({
  get: projectProcedure
    .input(z.object({ projectId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      if (!ctx.user.permissions.includes('prime_contract.view'))
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Insufficient permissions.' });
      try {
        return await getPrimeContract(input.projectId);
      } catch (err) {
        mapError(err);
      }
    }),

  create: projectProcedure
    .input(CreatePrimeContractInputSchema)
    .mutation(async ({ ctx, input }) => {
      if (!ctx.user.permissions.includes('prime_contract.create'))
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Insufficient permissions.' });
      try {
        return await createPrimeContract(input);
      } catch (err) {
        mapError(err);
      }
    }),

  update: projectProcedure
    .input(UpdatePrimeContractInputSchema)
    .mutation(async ({ ctx, input }) => {
      if (!ctx.user.permissions.includes('prime_contract.edit'))
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Insufficient permissions.' });
      try {
        return await updatePrimeContract(input, ctx.user.id);
      } catch (err) {
        mapError(err);
      }
    }),

  transition: projectProcedure
    .input(z.object({
      projectId: z.string().uuid(),
      action: PrimeContractActionEnum,
      comment: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const requiredPerm = getTransitionPermission('prime_contract', input.action);
      if (!hasPerm(ctx, requiredPerm))
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Insufficient permissions.' });
      try {
        return await transitionPrimeContractStatus(
          input.projectId,
          input.action,
          ctx.user.id,
          input.comment,
        );
      } catch (err) {
        mapError(err);
      }
    }),

  delete: projectProcedure
    .input(z.object({ projectId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      if (!ctx.user.permissions.includes('prime_contract.delete'))
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Insufficient permissions.' });
      try {
        await deletePrimeContract(input.projectId, ctx.user.id);
        return { success: true };
      } catch (err) {
        mapError(err);
      }
    }),

  /**
   * Returns the caller's prime_contract permissions for UI gating.
   */
  myPermissions: protectedProcedure.query(({ ctx }) => {
    return ctx.user.permissions.filter((p) => p.startsWith('prime_contract.'));
  }),
});
