import { z } from 'zod';

/**
 * Quotation contract schemas — aligned with Prisma model.
 *
 * Ghost fields removed (deliveryDate, notes at top level) — these have no
 * Prisma column and were silently dropped. paymentTerms and deliveryTerms
 * ARE valid Prisma columns and are kept. Stabilization Slice A.
 */
export const CreateQuotationInputSchema = z.object({
  projectId: z.string().uuid(),
  rfqId: z.string().uuid(),
  vendorId: z.string().uuid(),
  currency: z.string().min(1),
  totalAmount: z.number().positive(),
  validUntil: z.string().datetime().optional(),
  paymentTerms: z.string().optional(),
  deliveryTerms: z.string().optional(),
  items: z.array(z.object({
    rfqItemId: z.string().uuid().optional(),
    itemDescription: z.string().min(1),
    unit: z.string().min(1),
    quantity: z.number().positive(),
    unitPrice: z.number().positive(),
    totalPrice: z.number().positive(),
    notes: z.string().optional(),
  })).optional(),
});
export type CreateQuotationInput = z.infer<typeof CreateQuotationInputSchema>;

export const UpdateQuotationInputSchema = z.object({
  id: z.string().uuid(),
  currency: z.string().min(1).optional(),
  totalAmount: z.number().positive().optional(),
  validUntil: z.string().datetime().nullable().optional(),
  paymentTerms: z.string().nullable().optional(),
  deliveryTerms: z.string().nullable().optional(),
  items: z.array(z.object({
    rfqItemId: z.string().uuid().optional(),
    itemDescription: z.string().min(1),
    unit: z.string().min(1),
    quantity: z.number().positive(),
    unitPrice: z.number().positive(),
    totalPrice: z.number().positive(),
    notes: z.string().optional(),
  })).optional(),
});
export type UpdateQuotationInput = z.infer<typeof UpdateQuotationInputSchema>;
