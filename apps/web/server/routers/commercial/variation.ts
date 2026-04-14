/**
 * Variation tRPC sub-router.
 *
 * Task 18: Commercial tRPC Router — Module 2 Commercial Engine.
 *
 * Special: list merges ListFilterInputSchema with VariationListFilterSchema,
 * and transition includes optional assessmentData.
 */
import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import {
  CreateVariationInputSchema,
  UpdateVariationInputSchema,
  ListFilterInputSchema,
  VariationListFilterSchema,
} from '@fmksa/contracts';
import {
  createVariation,
  updateVariation,
  transitionVariation,
  getVariation,
  listVariations,
  deleteVariation,
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

export const variationRouter = router({
  list: projectProcedure
    .input(ListFilterInputSchema.merge(VariationListFilterSchema.partial()))
    .query(async ({ ctx, input }) => {
      if (!ctx.user.permissions.includes('variation.view'))
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Insufficient permissions.',
        });
      const { subtypeFilter, ...listInput } = input;
      return listVariations(
        listInput,
        subtypeFilter ? { subtypeFilter } : undefined,
      );
    }),

  get: projectProcedure
    .input(z.object({ projectId: z.string().uuid(), id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      if (!ctx.user.permissions.includes('variation.view'))
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Insufficient permissions.',
        });
      try {
        return await getVariation(input.id, input.projectId);
      } catch (err) {
        mapError(err);
      }
    }),

  create: projectProcedure
    .input(CreateVariationInputSchema)
    .mutation(async ({ ctx, input }) => {
      if (!ctx.user.permissions.includes('variation.create'))
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Insufficient permissions.',
        });
      try {
        return await createVariation(input, ctx.user.id);
      } catch (err) {
        mapError(err);
      }
    }),

  update: projectProcedure
    .input(
      UpdateVariationInputSchema.extend({ projectId: z.string().uuid() }),
    )
    .mutation(async ({ ctx, input }) => {
      if (!ctx.user.permissions.includes('variation.edit'))
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Insufficient permissions.',
        });
      try {
        return await updateVariation(input, ctx.user.id, input.projectId);
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
        assessmentData: z
          .object({
            assessedCostImpact: z.number().nullable(),
            assessedTimeImpactDays: z.number().int().nullable(),
            approvedCostImpact: z.number().nullable(),
            approvedTimeImpactDays: z.number().int().nullable(),
          })
          .partial()
          .optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const requiredPerm = getTransitionPermission('variation', input.action);
      if (!hasPerm(ctx, requiredPerm))
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: `Insufficient permissions${requiredPerm ? ` (requires ${requiredPerm})` : ''}.`,
        });
      try {
        // Strip undefined values for exactOptionalPropertyTypes compat
        const assessment = input.assessmentData
          ? (Object.fromEntries(
              Object.entries(input.assessmentData).filter(
                ([, v]) => v !== undefined,
              ),
            ) as {
              assessedCostImpact?: number | null;
              assessedTimeImpactDays?: number | null;
              approvedCostImpact?: number | null;
              approvedTimeImpactDays?: number | null;
            })
          : undefined;
        return await transitionVariation(
          input.id,
          input.action,
          ctx.user.id,
          input.comment,
          assessment,
          input.projectId,
        );
      } catch (err) {
        mapError(err);
      }
    }),

  delete: projectProcedure
    .input(z.object({ projectId: z.string().uuid(), id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      if (!ctx.user.permissions.includes('variation.delete'))
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Insufficient permissions.',
        });
      try {
        await deleteVariation(input.id, ctx.user.id, input.projectId);
        return { success: true };
      } catch (err) {
        mapError(err);
      }
    }),
});
