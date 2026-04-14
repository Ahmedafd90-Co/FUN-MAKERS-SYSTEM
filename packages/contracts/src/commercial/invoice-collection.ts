/**
 * Invoice Collection contract schemas — shared between client and server.
 *
 * Records actual money received against tax invoices. Each collection is a
 * positive payment event. No edits, no deletes, no negative adjustments in v1.
 */
import { z } from 'zod';

// ---------------------------------------------------------------------------
// Record a collection
// ---------------------------------------------------------------------------

export const RecordCollectionSchema = z.object({
  taxInvoiceId: z.string().uuid('Invalid tax invoice ID.'),
  amount: z.number().positive('Collection amount must be positive.'),
  collectionDate: z.coerce.date(),
  paymentMethod: z.string().min(1).optional(),
  reference: z.string().min(1).optional(),
  notes: z.string().min(1).optional(),
});

export type RecordCollectionInput = z.infer<typeof RecordCollectionSchema>;

// ---------------------------------------------------------------------------
// List collections for an invoice
// ---------------------------------------------------------------------------

export const ListCollectionsSchema = z.object({
  taxInvoiceId: z.string().uuid('Invalid tax invoice ID.'),
});

export type ListCollectionsInput = z.infer<typeof ListCollectionsSchema>;

// ---------------------------------------------------------------------------
// Get outstanding amount for an invoice
// ---------------------------------------------------------------------------

export const GetOutstandingSchema = z.object({
  taxInvoiceId: z.string().uuid('Invalid tax invoice ID.'),
});

export type GetOutstandingInput = z.infer<typeof GetOutstandingSchema>;
