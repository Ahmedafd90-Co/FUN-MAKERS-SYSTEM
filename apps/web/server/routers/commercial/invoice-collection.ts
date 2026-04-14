/**
 * Invoice Collection tRPC sub-router.
 *
 * Phase D1: Records actual money received against tax invoices.
 */
import { TRPCError } from '@trpc/server';
import {
  RecordCollectionSchema,
  ListCollectionsSchema,
  GetOutstandingSchema,
} from '@fmksa/contracts';
import {
  recordCollection,
  listCollections,
  getOutstandingAmount,
} from '@fmksa/core';
import { router, projectProcedure } from '../../trpc';

// ---------------------------------------------------------------------------
// Error mapping
// ---------------------------------------------------------------------------

function mapError(err: unknown): never {
  if (err instanceof Error) {
    if (err.message.includes('not found') || err.message.includes('findUniqueOrThrow'))
      throw new TRPCError({ code: 'NOT_FOUND', message: err.message });
    if (err.message.includes('Cannot') || err.message.includes('Overcollection'))
      throw new TRPCError({ code: 'BAD_REQUEST', message: err.message });
  }
  throw err;
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

export const invoiceCollectionRouter = router({
  record: projectProcedure
    .input(RecordCollectionSchema)
    .mutation(async ({ ctx, input }) => {
      if (!ctx.user.permissions.includes('tax_invoice.edit'))
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Insufficient permissions to record collection.',
        });
      try {
        return await recordCollection(input, ctx.user.id);
      } catch (err) {
        mapError(err);
      }
    }),

  list: projectProcedure
    .input(ListCollectionsSchema)
    .query(async ({ ctx, input }) => {
      if (!ctx.user.permissions.includes('tax_invoice.view'))
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Insufficient permissions.',
        });
      try {
        return await listCollections(input.taxInvoiceId);
      } catch (err) {
        mapError(err);
      }
    }),

  outstanding: projectProcedure
    .input(GetOutstandingSchema)
    .query(async ({ ctx, input }) => {
      if (!ctx.user.permissions.includes('tax_invoice.view'))
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Insufficient permissions.',
        });
      try {
        return await getOutstandingAmount(input.taxInvoiceId);
      } catch (err) {
        mapError(err);
      }
    }),
});
