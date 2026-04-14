/**
 * CreditNote tRPC sub-router — project-scoped CRUD + transitions.
 *
 * Module 3 Procurement Engine — Credit Note lifecycle.
 */
import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import {
  createCreditNote,
  getCreditNote,
  listCreditNotes,
  transitionCreditNote,
} from '@fmksa/core';
import { router, projectProcedure } from '../../trpc';
import { mapError, getTransitionPermission, hasPerm } from './_helpers';

// ---------------------------------------------------------------------------
// Input schemas
// ---------------------------------------------------------------------------

const CreateCreditNoteInputSchema = z.object({
  projectId: z.string().uuid(),
  vendorId: z.string().uuid(),
  subtype: z.string().min(1),
  creditNoteNumber: z.string().min(1),
  supplierInvoiceId: z.string().uuid().optional(),
  purchaseOrderId: z.string().uuid().optional(),
  correspondenceId: z.string().uuid().optional(),
  amount: z.union([z.number(), z.string()]),
  currency: z.string().min(3).max(3),
  reason: z.string().min(1),
  receivedDate: z.string(),
});

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

export const creditNoteRouter = router({
  list: projectProcedure
    .input(z.object({ projectId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      if (!ctx.user.permissions.includes('credit_note.view'))
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Insufficient permissions.' });
      return listCreditNotes(input.projectId);
    }),

  get: projectProcedure
    .input(z.object({ projectId: z.string().uuid(), id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      if (!ctx.user.permissions.includes('credit_note.view'))
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Insufficient permissions.' });
      try {
        return await getCreditNote(input.id, input.projectId);
      } catch (err) {
        mapError(err);
      }
    }),

  create: projectProcedure
    .input(CreateCreditNoteInputSchema)
    .mutation(async ({ ctx, input }) => {
      if (!ctx.user.permissions.includes('credit_note.create'))
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Insufficient permissions.' });
      try {
        return await createCreditNote(input, ctx.user.id);
      } catch (err) {
        mapError(err);
      }
    }),

  transition: projectProcedure
    .input(z.object({
      projectId: z.string().uuid(),
      id: z.string().uuid(),
      action: z.string(),
      comment: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const requiredPerm = getTransitionPermission('credit_note', input.action);
      if (!hasPerm(ctx, requiredPerm))
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Insufficient permissions.' });
      try {
        return await transitionCreditNote(input, ctx.user.id);
      } catch (err) {
        mapError(err);
      }
    }),
});
