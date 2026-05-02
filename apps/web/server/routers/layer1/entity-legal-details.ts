/**
 * EntityLegalDetails tRPC sub-router — entity-scoped.
 *
 * Layer 1 — PR-A2 (PIC-13).
 *
 * 3 endpoints (get / upsert / delete) plus myPermissions, all gated by
 * entity_legal_details.* permissions. Uses entityProcedure so the entityId is
 * extracted from input and entity membership is verified upstream.
 */
import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { UpsertEntityLegalDetailsInputSchema } from '@fmksa/contracts';
import {
  getEntityLegalDetails,
  upsertEntityLegalDetails,
  deleteEntityLegalDetails,
} from '@fmksa/core';
import { router, entityProcedure, protectedProcedure } from '../../trpc';
import { mapError, hasPerm } from './_helpers';

export const entityLegalDetailsRouter = router({
  get: entityProcedure
    .input(z.object({ entityId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      if (!hasPerm(ctx, 'entity_legal_details.view'))
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Insufficient permissions.' });
      try {
        return await getEntityLegalDetails(input.entityId);
      } catch (err) {
        mapError(err);
      }
    }),

  upsert: entityProcedure
    .input(UpsertEntityLegalDetailsInputSchema)
    .mutation(async ({ ctx, input }) => {
      if (!hasPerm(ctx, 'entity_legal_details.edit'))
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Insufficient permissions.' });
      try {
        return await upsertEntityLegalDetails(input);
      } catch (err) {
        mapError(err);
      }
    }),

  delete: entityProcedure
    .input(z.object({ entityId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      if (!hasPerm(ctx, 'entity_legal_details.delete'))
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Insufficient permissions.' });
      try {
        await deleteEntityLegalDetails(input.entityId, ctx.user.id);
        return { success: true };
      } catch (err) {
        mapError(err);
      }
    }),

  /**
   * Returns the caller's entity_legal_details permissions for UI gating.
   */
  myPermissions: protectedProcedure.query(({ ctx }) => {
    return ctx.user.permissions.filter((p) => p.startsWith('entity_legal_details.'));
  }),
});
