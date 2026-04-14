/**
 * Correspondence tRPC sub-router.
 *
 * Task 18: Commercial tRPC Router — Module 2 Commercial Engine.
 *
 * Special: list merges ListFilterInputSchema with CorrespondenceListFilterSchema.
 */
import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import {
  CreateCorrespondenceInputSchema,
  UpdateCorrespondenceInputSchema,
  ListFilterInputSchema,
  CorrespondenceListFilterSchema,
} from '@fmksa/contracts';
import {
  createCorrespondence,
  updateCorrespondence,
  updateSettlementFields,
  transitionCorrespondence,
  getCorrespondence,
  listCorrespondences,
  deleteCorrespondence,
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

export const correspondenceRouter = router({
  list: projectProcedure
    .input(
      ListFilterInputSchema.merge(
        CorrespondenceListFilterSchema.partial(),
      ),
    )
    .query(async ({ ctx, input }) => {
      if (!ctx.user.permissions.includes('correspondence.view'))
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Insufficient permissions.',
        });
      const { subtypeFilter, ...listInput } = input;
      return listCorrespondences(
        listInput,
        subtypeFilter ? { subtypeFilter } : undefined,
      );
    }),

  get: projectProcedure
    .input(z.object({ projectId: z.string().uuid(), id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      if (!ctx.user.permissions.includes('correspondence.view'))
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Insufficient permissions.',
        });
      try {
        return await getCorrespondence(input.id, input.projectId);
      } catch (err) {
        mapError(err);
      }
    }),

  create: projectProcedure
    .input(CreateCorrespondenceInputSchema)
    .mutation(async ({ ctx, input }) => {
      if (!ctx.user.permissions.includes('correspondence.create'))
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Insufficient permissions.',
        });
      try {
        return await createCorrespondence(input, ctx.user.id);
      } catch (err) {
        mapError(err);
      }
    }),

  update: projectProcedure
    .input(
      UpdateCorrespondenceInputSchema.extend({
        projectId: z.string().uuid(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (!ctx.user.permissions.includes('correspondence.edit'))
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Insufficient permissions.',
        });
      try {
        return await updateCorrespondence(input, ctx.user.id, input.projectId);
      } catch (err) {
        mapError(err);
      }
    }),

  updateSettlement: projectProcedure
    .input(
      z.object({
        projectId: z.string().uuid(),
        id: z.string().uuid(),
        settledAmount: z.number().min(0).nullable().optional(),
        settledTimeDays: z.number().int().min(0).nullable().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (!ctx.user.permissions.includes('correspondence.edit'))
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Insufficient permissions.',
        });
      try {
        const fields: { settledAmount?: number | null; settledTimeDays?: number | null } = {};
        if (input.settledAmount !== undefined) fields.settledAmount = input.settledAmount;
        if (input.settledTimeDays !== undefined) fields.settledTimeDays = input.settledTimeDays;
        return await updateSettlementFields(
          input.id,
          fields,
          ctx.user.id,
          input.projectId,
        );
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
      const requiredPerm = getTransitionPermission('correspondence', input.action);
      if (!hasPerm(ctx, requiredPerm))
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: `Insufficient permissions${requiredPerm ? ` (requires ${requiredPerm})` : ''}.`,
        });
      try {
        return await transitionCorrespondence(
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
      if (!ctx.user.permissions.includes('correspondence.delete'))
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Insufficient permissions.',
        });
      try {
        await deleteCorrespondence(input.id, ctx.user.id, input.projectId);
        return { success: true };
      } catch (err) {
        mapError(err);
      }
    }),
});
