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
  ScopeMismatchError,
} from '@fmksa/core';
import { router, projectProcedure } from '../../trpc';

// ---------------------------------------------------------------------------
// Error mapping
// ---------------------------------------------------------------------------

function mapError(err: unknown): never {
  // PIC-97 hotfix: NOT-FOUND-shaped (mirror handleImportError + documents.get) —
  // never disclose that the invoice exists in a different tenant.
  if (err instanceof ScopeMismatchError) {
    throw new TRPCError({
      code: 'NOT_FOUND',
      message: 'Tax invoice not found.',
      cause: err,
    });
  }
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
        // PIC-97 hotfix: pass ctx.projectId (the chokepoint-validated tenant
        // scope) so the service can assert the by-id taxInvoice belongs to it.
        // RecordCollectionSchema strips `projectId` via zod; ctx.projectId is
        // the canonical source.
        return await recordCollection(input, ctx.user.id, ctx.projectId);
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
        // PIC-71 PR-2 γ-fold: mirror recordCollection's ctx.projectId injection
        // (GetOutstandingSchema strips projectId via zod; the projectProcedure
        // chokepoint reads raw input + injects ctx.projectId). Same NOT_FOUND
        // mapping path via mapError → ScopeMismatchError.
        return await getOutstandingAmount(input.taxInvoiceId, ctx.projectId);
      } catch (err) {
        mapError(err);
      }
    }),
});
