/**
 * Engineer Instruction (EI) tRPC sub-router.
 *
 * EIs represent field instructions that MAY become VOs/COs.
 * On approval, a provisional reserve (50% of estimated value) is created
 * in the internal budget. This reserve does NOT affect external contract value.
 */
import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import {
  createEi,
  getEi,
  listEis,
  transitionEi,
} from '@fmksa/core';
import { router, projectProcedure } from '../../trpc';

export const engineerInstructionRouter = router({
  list: projectProcedure
    .input(z.object({ projectId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      if (!ctx.user.permissions.includes('variation.view'))
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Insufficient permissions.' });
      return listEis(input.projectId);
    }),

  get: projectProcedure
    .input(z.object({ projectId: z.string().uuid(), id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      if (!ctx.user.permissions.includes('variation.view'))
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Insufficient permissions.' });
      return getEi(input.id);
    }),

  create: projectProcedure
    .input(
      z.object({
        projectId: z.string().uuid(),
        title: z.string().min(1),
        description: z.string().optional(),
        estimatedValue: z.number().positive(),
        currency: z.string().min(1),
        reserveRate: z.number().min(0).max(1).optional(),
        notes: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (!ctx.user.permissions.includes('variation.create'))
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Insufficient permissions.' });
      return createEi(input, ctx.user.id);
    }),

  transition: projectProcedure
    .input(
      z.object({
        projectId: z.string().uuid(),
        id: z.string().uuid(),
        action: z.string().min(1),
        variationId: z.string().uuid().optional(),
        comment: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (!ctx.user.permissions.includes('variation.edit'))
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Insufficient permissions.' });
      return transitionEi(input, ctx.user.id);
    }),
});
