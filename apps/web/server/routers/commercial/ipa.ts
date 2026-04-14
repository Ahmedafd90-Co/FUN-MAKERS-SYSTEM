/**
 * IPA (Interim Payment Application) tRPC sub-router.
 *
 * Task 18: Commercial tRPC Router — Module 2 Commercial Engine.
 */
import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import {
  CreateIpaInputSchema,
  UpdateIpaInputSchema,
  ListFilterInputSchema,
} from '@fmksa/contracts';
import {
  createIpa,
  updateIpa,
  transitionIpa,
  getIpa,
  listIpas,
  deleteIpa,
} from '@fmksa/core';
import { router, projectProcedure } from '../../trpc';
import { getTransitionPermission, hasPerm } from './transition-permissions';

// ---------------------------------------------------------------------------
// Error mapping helper
// ---------------------------------------------------------------------------

function mapError(err: unknown): never {
  if (err instanceof Error) {
    if (err.message.includes('does not belong to the expected'))
      throw new TRPCError({ code: 'NOT_FOUND', message: err.message });
    if (
      err.message.includes('not found') ||
      err.message.includes('findUniqueOrThrow')
    )
      throw new TRPCError({ code: 'NOT_FOUND', message: err.message });
    if (err.message.includes('Cannot'))
      throw new TRPCError({ code: 'BAD_REQUEST', message: err.message });
    if (err.message.includes('Invalid'))
      throw new TRPCError({ code: 'BAD_REQUEST', message: err.message });
    if (err.message.includes('Unknown'))
      throw new TRPCError({ code: 'BAD_REQUEST', message: err.message });
  }
  throw err;
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

export const ipaRouter = router({
  list: projectProcedure
    .input(ListFilterInputSchema)
    .query(async ({ ctx, input }) => {
      if (!ctx.user.permissions.includes('ipa.view'))
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Insufficient permissions.',
        });
      return listIpas(input);
    }),

  get: projectProcedure
    .input(z.object({ projectId: z.string().uuid(), id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      if (!ctx.user.permissions.includes('ipa.view'))
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Insufficient permissions.',
        });
      try {
        return await getIpa(input.id, input.projectId);
      } catch (err) {
        mapError(err);
      }
    }),

  create: projectProcedure
    .input(CreateIpaInputSchema)
    .mutation(async ({ ctx, input }) => {
      if (!ctx.user.permissions.includes('ipa.create'))
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Insufficient permissions.',
        });
      try {
        return await createIpa(input, ctx.user.id);
      } catch (err) {
        mapError(err);
      }
    }),

  update: projectProcedure
    .input(UpdateIpaInputSchema.extend({ projectId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      if (!ctx.user.permissions.includes('ipa.edit'))
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Insufficient permissions.',
        });
      try {
        return await updateIpa(input, ctx.user.id, input.projectId);
      } catch (err) {
        mapError(err);
      }
    }),

  transition: projectProcedure
    .input(
      z.object({
        projectId: z.string().uuid(),
        id: z.string().uuid(),
        action: z.string(),
        comment: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const requiredPerm = getTransitionPermission('ipa', input.action);
      if (!hasPerm(ctx, requiredPerm))
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: `Insufficient permissions${requiredPerm ? ` (requires ${requiredPerm})` : ''}.`,
        });
      try {
        return await transitionIpa(
          input.id,
          input.action,
          ctx.user.id,
          input.comment,
          input.projectId,
        );
      } catch (err) {
        mapError(err);
      }
    }),

  delete: projectProcedure
    .input(z.object({ projectId: z.string().uuid(), id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      if (!ctx.user.permissions.includes('ipa.delete'))
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Insufficient permissions.',
        });
      try {
        await deleteIpa(input.id, ctx.user.id, input.projectId);
        return { success: true };
      } catch (err) {
        mapError(err);
      }
    }),
});
