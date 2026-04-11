/**
 * ProjectVendor tRPC sub-router — project-scoped.
 *
 * Phase 4, Task 4.6 — Module 3 Procurement Engine.
 * Permission alignment: H3 hardening patch.
 */
import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import {
  linkVendorToProject,
  unlinkVendorFromProject,
  listProjectVendors,
  getProjectVendor,
} from '@fmksa/core';
import { router, projectProcedure } from '../../trpc';
import { mapError } from './_helpers';

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

export const projectVendorRouter = router({
  list: projectProcedure
    .input(z.object({ projectId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      if (!ctx.user.permissions.includes('project_vendor.view'))
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Insufficient permissions.' });
      return listProjectVendors(input.projectId);
    }),

  get: projectProcedure
    .input(z.object({ projectId: z.string().uuid(), id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      if (!ctx.user.permissions.includes('project_vendor.view'))
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Insufficient permissions.' });
      try {
        return await getProjectVendor(input.id, input.projectId);
      } catch (err) {
        mapError(err);
      }
    }),

  link: projectProcedure
    .input(z.object({ projectId: z.string().uuid(), vendorId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      if (!ctx.user.permissions.includes('project_vendor.manage'))
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Insufficient permissions.' });
      try {
        return await linkVendorToProject(input, ctx.user.id);
      } catch (err) {
        mapError(err);
      }
    }),

  unlink: projectProcedure
    .input(z.object({ projectId: z.string().uuid(), id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      if (!ctx.user.permissions.includes('project_vendor.manage'))
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Insufficient permissions.' });
      try {
        return await unlinkVendorFromProject(input.id, ctx.user.id, input.projectId);
      } catch (err) {
        mapError(err);
      }
    }),
});
