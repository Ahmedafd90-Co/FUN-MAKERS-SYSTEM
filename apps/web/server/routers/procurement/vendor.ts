/**
 * Vendor tRPC sub-router — entity-scoped.
 *
 * Phase 4, Task 4.6 — Module 3 Procurement Engine.
 * Permission alignment: H3 hardening patch.
 */
import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import {
  CreateVendorInputSchema,
  UpdateVendorInputSchema,
  EntityListFilterInputSchema,
} from '@fmksa/contracts';
import {
  createVendor,
  updateVendor,
  transitionVendor,
  getVendor,
  listVendors,
  deleteVendor,
} from '@fmksa/core';
import { router, entityProcedure } from '../../trpc';
import { mapError, hasEntityPerm, getTransitionPermission } from './_helpers';

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

export const vendorRouter = router({
  list: entityProcedure
    .input(EntityListFilterInputSchema.extend({ search: z.string().optional(), classificationFilter: z.string().optional() }))
    .query(async ({ ctx, input }) => {
      if (!hasEntityPerm(ctx, 'vendor.view'))
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Insufficient permissions.' });
      return listVendors(input);
    }),

  get: entityProcedure
    .input(z.object({ entityId: z.string().uuid(), id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      if (!hasEntityPerm(ctx, 'vendor.view'))
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Insufficient permissions.' });
      try {
        return await getVendor(input.id, input.entityId);
      } catch (err) {
        mapError(err);
      }
    }),

  create: entityProcedure
    .input(CreateVendorInputSchema)
    .mutation(async ({ ctx, input }) => {
      if (!hasEntityPerm(ctx, 'vendor.create'))
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Insufficient permissions.' });
      try {
        return await createVendor(input, ctx.user.id);
      } catch (err) {
        mapError(err);
      }
    }),

  update: entityProcedure
    .input(UpdateVendorInputSchema.extend({ entityId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      if (!hasEntityPerm(ctx, 'vendor.edit'))
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Insufficient permissions.' });
      try {
        return await updateVendor(input, ctx.user.id, input.entityId);
      } catch (err) {
        mapError(err);
      }
    }),

  transition: entityProcedure
    .input(z.object({
      entityId: z.string().uuid(),
      id: z.string().uuid(),
      action: z.string(),
      comment: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const requiredPerm = getTransitionPermission('vendor', input.action);
      if (!hasEntityPerm(ctx, requiredPerm))
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Insufficient permissions.' });
      try {
        return await transitionVendor(input.id, input.action, ctx.user.id, input.comment, input.entityId);
      } catch (err) {
        mapError(err);
      }
    }),

  delete: entityProcedure
    .input(z.object({ entityId: z.string().uuid(), id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      if (!hasEntityPerm(ctx, 'vendor.delete'))
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Insufficient permissions.' });
      try {
        await deleteVendor(input.id, ctx.user.id, input.entityId);
        return { success: true };
      } catch (err) {
        mapError(err);
      }
    }),
});
