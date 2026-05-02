/**
 * ProjectParticipant tRPC sub-router — project-scoped.
 *
 * Layer 1 — PR-A2 (PIC-13).
 *
 * 5 CRUD endpoints + myPermissions, all gated by project_participant.*
 * permissions. Uses projectProcedure so the projectId is extracted from input
 * and project assignment is verified upstream.
 *
 * Note: deleteProjectParticipant may throw with messages "Cannot delete: prime
 * contract holder" or "Cannot delete: active intercompany contracts". These
 * surface to the caller as TRPCError BAD_REQUEST via mapError.
 */
import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import {
  CreateProjectParticipantInputSchema,
  UpdateProjectParticipantInputSchema,
  ListProjectParticipantsFilterSchema,
} from '@fmksa/contracts';
import {
  createProjectParticipant,
  getProjectParticipant,
  listProjectParticipants,
  updateProjectParticipant,
  deleteProjectParticipant,
} from '@fmksa/core';
import { router, projectProcedure, protectedProcedure } from '../../trpc';
import { mapError } from './_helpers';

export const projectParticipantsRouter = router({
  list: projectProcedure
    .input(ListProjectParticipantsFilterSchema)
    .query(async ({ ctx, input }) => {
      if (!ctx.user.permissions.includes('project_participant.view'))
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Insufficient permissions.' });
      return listProjectParticipants(input);
    }),

  get: projectProcedure
    .input(z.object({ projectId: z.string().uuid(), id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      if (!ctx.user.permissions.includes('project_participant.view'))
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Insufficient permissions.' });
      try {
        return await getProjectParticipant(input.id, input.projectId);
      } catch (err) {
        mapError(err);
      }
    }),

  create: projectProcedure
    .input(CreateProjectParticipantInputSchema)
    .mutation(async ({ ctx, input }) => {
      if (!ctx.user.permissions.includes('project_participant.create'))
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Insufficient permissions.' });
      try {
        return await createProjectParticipant(input);
      } catch (err) {
        mapError(err);
      }
    }),

  update: projectProcedure
    .input(UpdateProjectParticipantInputSchema)
    .mutation(async ({ ctx, input }) => {
      if (!ctx.user.permissions.includes('project_participant.edit'))
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Insufficient permissions.' });
      try {
        return await updateProjectParticipant(input, ctx.user.id);
      } catch (err) {
        mapError(err);
      }
    }),

  delete: projectProcedure
    .input(z.object({ projectId: z.string().uuid(), id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      if (!ctx.user.permissions.includes('project_participant.delete'))
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Insufficient permissions.' });
      try {
        await deleteProjectParticipant(input.id, input.projectId, ctx.user.id);
        return { success: true };
      } catch (err) {
        mapError(err);
      }
    }),

  /**
   * Returns the caller's project_participant permissions for UI gating.
   */
  myPermissions: protectedProcedure.query(({ ctx }) => {
    return ctx.user.permissions.filter((p) => p.startsWith('project_participant.'));
  }),
});
