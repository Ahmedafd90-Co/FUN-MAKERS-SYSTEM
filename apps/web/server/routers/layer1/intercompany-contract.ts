/**
 * IntercompanyContract tRPC sub-router — project-scoped, directional Entity → Entity.
 *
 * Layer 1 — PR-A2 (PIC-13).
 *
 * 6 endpoints + myPermissions, all gated by intercompany_contract.* permissions.
 * Transition action verb typed via z.enum (compile-time safe).
 *
 * Permission check on transition uses getTransitionPermission to resolve to the
 * specific sign / activate / close / cancel permission code.
 */
import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import {
  CreateIntercompanyContractInputSchema,
  UpdateIntercompanyContractInputSchema,
  ListIntercompanyContractsFilterSchema,
} from '@fmksa/contracts';
import {
  createIntercompanyContract,
  getIntercompanyContract,
  listIntercompanyContracts,
  updateIntercompanyContract,
  transitionIntercompanyContractStatus,
  deleteIntercompanyContract,
} from '@fmksa/core';
import { router, projectProcedure, protectedProcedure } from '../../trpc';
import { mapError, hasPerm, getTransitionPermission } from './_helpers';

// Action verbs enumerated for compile-time safety. Service-layer state machine
// is the canonical source of allowed transitions.
const IntercompanyContractActionEnum = z.enum([
  'sign',
  'activate',
  'close',
  'cancel',
]);

export const intercompanyContractRouter = router({
  list: projectProcedure
    .input(ListIntercompanyContractsFilterSchema)
    .query(async ({ ctx, input }) => {
      if (!ctx.user.permissions.includes('intercompany_contract.view'))
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Insufficient permissions.' });
      return listIntercompanyContracts(input);
    }),

  get: projectProcedure
    .input(z.object({ projectId: z.string().uuid(), id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      if (!ctx.user.permissions.includes('intercompany_contract.view'))
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Insufficient permissions.' });
      try {
        return await getIntercompanyContract(input.id, input.projectId);
      } catch (err) {
        mapError(err);
      }
    }),

  create: projectProcedure
    .input(CreateIntercompanyContractInputSchema)
    .mutation(async ({ ctx, input }) => {
      if (!ctx.user.permissions.includes('intercompany_contract.create'))
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Insufficient permissions.' });
      try {
        return await createIntercompanyContract(input);
      } catch (err) {
        mapError(err);
      }
    }),

  update: projectProcedure
    .input(UpdateIntercompanyContractInputSchema)
    .mutation(async ({ ctx, input }) => {
      if (!ctx.user.permissions.includes('intercompany_contract.edit'))
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Insufficient permissions.' });
      try {
        return await updateIntercompanyContract(input, ctx.user.id);
      } catch (err) {
        mapError(err);
      }
    }),

  transition: projectProcedure
    .input(z.object({
      projectId: z.string().uuid(),
      id: z.string().uuid(),
      action: IntercompanyContractActionEnum,
      comment: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const requiredPerm = getTransitionPermission('intercompany_contract', input.action);
      if (!hasPerm(ctx, requiredPerm))
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Insufficient permissions.' });
      try {
        return await transitionIntercompanyContractStatus(
          input.id,
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
    .input(z.object({ projectId: z.string().uuid(), id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      if (!ctx.user.permissions.includes('intercompany_contract.delete'))
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Insufficient permissions.' });
      try {
        await deleteIntercompanyContract(input.id, input.projectId, ctx.user.id);
        return { success: true };
      } catch (err) {
        mapError(err);
      }
    }),

  /**
   * Returns the caller's intercompany_contract permissions for UI gating.
   */
  myPermissions: protectedProcedure.query(({ ctx }) => {
    return ctx.user.permissions.filter((p) => p.startsWith('intercompany_contract.'));
  }),
});
