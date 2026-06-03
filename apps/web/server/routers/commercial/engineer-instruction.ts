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
import { assertRecordOrgOrNotFound } from '../../middleware/org-scope';

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
      // PIC-97 (F3): getEi fetches by id alone — assert it's in the caller's
      // scope, NOT-FOUND-shaped. `.catch(() => null)` collapses getEi's
      // not-found throw AND PIC-71 PR-2's service-layer assertProjectScope
      // throw into the SAME NOT_FOUND as a wrong-org record, so a fake id,
      // a cross-project id, and an org-B id are all indistinguishable (no
      // existence disclosure).
      //
      // PIC-71 PR-2 (β-sweep): pass input.projectId so the service binds the
      // project scope (stricter than org scope, consistent with documents.get
      // line-96 idiom). Router-level `assertRecordOrgOrNotFound` STAYS as
      // belt-and-suspenders — defends if a future refactor drops the service
      // assert, and preserves the F3 NOT-FOUND-shaped pattern for all denial
      // paths.
      const ei = await getEi(input.id, input.projectId).catch(() => null);
      return assertRecordOrgOrNotFound(ei, ctx, 'Engineer instruction');
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
