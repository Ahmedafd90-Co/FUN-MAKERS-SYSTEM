/**
 * Cost Proposal tRPC sub-router.
 *
 * Task 18: Commercial tRPC Router — Module 2 Commercial Engine.
 *
 * Special: transition includes optional assessmentData.
 */
import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import {
  CreateCostProposalInputSchema,
  UpdateCostProposalInputSchema,
  ListFilterInputSchema,
} from '@fmksa/contracts';
import {
  createCostProposal,
  updateCostProposal,
  transitionCostProposal,
  getCostProposal,
  listCostProposals,
  deleteCostProposal,
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

export const costProposalRouter = router({
  list: projectProcedure
    .input(ListFilterInputSchema)
    .query(async ({ ctx, input }) => {
      if (!ctx.user.permissions.includes('cost_proposal.list'))
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Insufficient permissions.',
        });
      return listCostProposals(input);
    }),

  get: projectProcedure
    .input(z.object({ projectId: z.string().uuid(), id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      if (!ctx.user.permissions.includes('cost_proposal.view'))
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Insufficient permissions.',
        });
      try {
        return await getCostProposal(input.id);
      } catch (err) {
        mapError(err);
      }
    }),

  create: projectProcedure
    .input(CreateCostProposalInputSchema)
    .mutation(async ({ ctx, input }) => {
      if (!ctx.user.permissions.includes('cost_proposal.create'))
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Insufficient permissions.',
        });
      try {
        return await createCostProposal(input, ctx.user.id);
      } catch (err) {
        mapError(err);
      }
    }),

  update: projectProcedure
    .input(
      UpdateCostProposalInputSchema.extend({
        projectId: z.string().uuid(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (!ctx.user.permissions.includes('cost_proposal.update'))
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Insufficient permissions.',
        });
      try {
        return await updateCostProposal(input, ctx.user.id);
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
            assessedCost: z.number().nullable(),
            assessedTimeDays: z.number().int().nullable(),
            approvedCost: z.number().nullable(),
            approvedTimeDays: z.number().int().nullable(),
          })
          .partial()
          .optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (!ctx.user.permissions.includes('cost_proposal.transition'))
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Insufficient permissions.',
        });
      try {
        // Strip undefined values for exactOptionalPropertyTypes compat
        const assessment = input.assessmentData
          ? (Object.fromEntries(
              Object.entries(input.assessmentData).filter(
                ([, v]) => v !== undefined,
              ),
            ) as {
              assessedCost?: number | null;
              assessedTimeDays?: number | null;
              approvedCost?: number | null;
              approvedTimeDays?: number | null;
            })
          : undefined;
        return await transitionCostProposal(
          input.id,
          input.action,
          ctx.user.id,
          input.comment,
          assessment,
        );
      } catch (err) {
        mapError(err);
      }
    }),

  delete: projectProcedure
    .input(z.object({ projectId: z.string().uuid(), id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      if (!ctx.user.permissions.includes('cost_proposal.delete'))
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Insufficient permissions.',
        });
      try {
        await deleteCostProposal(input.id, ctx.user.id);
        return { success: true };
      } catch (err) {
        mapError(err);
      }
    }),
});
