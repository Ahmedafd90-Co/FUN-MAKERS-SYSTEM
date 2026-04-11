/**
 * Tax Invoice tRPC sub-router.
 *
 * Task 18: Commercial tRPC Router — Module 2 Commercial Engine.
 */
import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import {
  CreateTaxInvoiceInputSchema,
  UpdateTaxInvoiceInputSchema,
  ListFilterInputSchema,
} from '@fmksa/contracts';
import {
  createTaxInvoice,
  updateTaxInvoice,
  transitionTaxInvoice,
  getTaxInvoice,
  listTaxInvoices,
  deleteTaxInvoice,
} from '@fmksa/core';
import { router, projectProcedure } from '../../trpc';

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

export const taxInvoiceRouter = router({
  list: projectProcedure
    .input(ListFilterInputSchema)
    .query(async ({ ctx, input }) => {
      if (!ctx.user.permissions.includes('tax_invoice.list'))
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Insufficient permissions.',
        });
      return listTaxInvoices(input);
    }),

  get: projectProcedure
    .input(z.object({ projectId: z.string().uuid(), id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      if (!ctx.user.permissions.includes('tax_invoice.view'))
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Insufficient permissions.',
        });
      try {
        return await getTaxInvoice(input.id, input.projectId);
      } catch (err) {
        mapError(err);
      }
    }),

  create: projectProcedure
    .input(CreateTaxInvoiceInputSchema)
    .mutation(async ({ ctx, input }) => {
      if (!ctx.user.permissions.includes('tax_invoice.create'))
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Insufficient permissions.',
        });
      try {
        return await createTaxInvoice(input, ctx.user.id);
      } catch (err) {
        mapError(err);
      }
    }),

  update: projectProcedure
    .input(
      UpdateTaxInvoiceInputSchema.extend({ projectId: z.string().uuid() }),
    )
    .mutation(async ({ ctx, input }) => {
      if (!ctx.user.permissions.includes('tax_invoice.update'))
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Insufficient permissions.',
        });
      try {
        return await updateTaxInvoice(input, ctx.user.id, input.projectId);
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
      if (!ctx.user.permissions.includes('tax_invoice.transition'))
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Insufficient permissions.',
        });
      try {
        return await transitionTaxInvoice(
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
      if (!ctx.user.permissions.includes('tax_invoice.delete'))
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Insufficient permissions.',
        });
      try {
        await deleteTaxInvoice(input.id, ctx.user.id, input.projectId);
        return { success: true };
      } catch (err) {
        mapError(err);
      }
    }),
});
