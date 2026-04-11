import { z } from 'zod';

export const CreateQuotationInputSchema = z.object({
  projectId: z.string().uuid(),
  rfqId: z.string().uuid(),
  vendorId: z.string().uuid(),
  currency: z.string().min(1),
  totalAmount: z.number().positive(),
  validUntil: z.string().datetime(),
  deliveryDate: z.string().datetime().optional(),
  paymentTerms: z.string().optional(),
  notes: z.string().optional(),
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
  validUntil: z.string().datetime().optional(),
  deliveryDate: z.string().datetime().nullable().optional(),
  paymentTerms: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
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
