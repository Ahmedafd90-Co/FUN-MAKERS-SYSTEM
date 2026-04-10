/**
 * IPC (Interim Payment Certificate) tRPC sub-router.
 *
 * Task 18: Commercial tRPC Router — Module 2 Commercial Engine.
 */
import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import {
  CreateIpcInputSchema,
  UpdateIpcInputSchema,
  ListFilterInputSchema,
} from '@fmksa/contracts';
import {
  createIpc,
  updateIpc,
  transitionIpc,
  getIpc,
  listIpcs,
  deleteIpc,
} from '@fmksa/core';
import { router, projectProcedure } from '../../trpc';

// ---------------------------------------------------------------------------
// Error mapping helper
// ---------------------------------------------------------------------------

function mapError(err: unknown): never {
  if (err instanceof Error) {
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

export const ipcRouter = router({
  list: projectProcedure
    .input(ListFilterInputSchema)
    .query(async ({ ctx, input }) => {
      if (!ctx.user.permissions.includes('ipc.list'))
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Insufficient permissions.',
        });
      return listIpcs(input);
    }),

  get: projectProcedure
    .input(z.object({ projectId: z.string().uuid(), id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      if (!ctx.user.permissions.includes('ipc.view'))
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Insufficient permissions.',
        });
      try {
        return await getIpc(input.id);
      } catch (err) {
        mapError(err);
      }
    }),

  create: projectProcedure
    .input(CreateIpcInputSchema)
    .mutation(async ({ ctx, input }) => {
      if (!ctx.user.permissions.includes('ipc.create'))
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Insufficient permissions.',
        });
      try {
        return await createIpc(input, ctx.user.id);
      } catch (err) {
        mapError(err);
      }
    }),

  update: projectProcedure
    .input(UpdateIpcInputSchema.extend({ projectId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      if (!ctx.user.permissions.includes('ipc.update'))
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Insufficient permissions.',
        });
      try {
        return await updateIpc(input, ctx.user.id);
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
      if (!ctx.user.permissions.includes('ipc.transition'))
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Insufficient permissions.',
        });
      try {
        return await transitionIpc(
          input.id,
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
      if (!ctx.user.permissions.includes('ipc.delete'))
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Insufficient permissions.',
        });
      try {
        await deleteIpc(input.id, ctx.user.id);
        return { success: true };
      } catch (err) {
        mapError(err);
      }
    }),
});
