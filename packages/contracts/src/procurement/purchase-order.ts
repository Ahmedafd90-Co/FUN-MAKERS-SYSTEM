import { z } from 'zod';

export const CreatePurchaseOrderInputSchema = z.object({
  projectId: z.string().uuid(),
  vendorId: z.string().uuid(),
  vendorContractId: z.string().uuid().optional(),
  quotationId: z.string().uuid().optional(),
  categoryId: z.string().uuid().optional(),
  currency: z.string().min(1),
  totalAmount: z.number().positive(),
  deliveryDate: z.string().datetime().optional(),
  deliveryLocation: z.string().optional(),
  paymentTerms: z.string().optional(),
  description: z.string().optional(),
  notes: z.string().optional(),
  items: z.array(z.object({
    itemCatalogId: z.string().uuid().optional(),
    itemDescription: z.string().min(1),
    unit: z.string().min(1),
    quantity: z.number().positive(),
    unitPrice: z.number().positive(),
    totalPrice: z.number().positive(),
    notes: z.string().optional(),
  })).optional(),
});
export type CreatePurchaseOrderInput = z.infer<typeof CreatePurchaseOrderInputSchema>;

export const UpdatePurchaseOrderInputSchema = z.object({
  id: z.string().uuid(),
  categoryId: z.string().uuid().nullable().optional(),
  currency: z.string().min(1).optional(),
  totalAmount: z.number().positive().optional(),
  deliveryDate: z.string().datetime().nullable().optional(),
  deliveryLocation: z.string().nullable().optional(),
  paymentTerms: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  items: z.array(z.object({
    itemCatalogId: z.string().uuid().optional(),
    itemDescription: z.string().min(1),
    unit: z.string().min(1),
    quantity: z.number().positive(),
    unitPrice: z.number().positive(),
    totalPrice: z.number().positive(),
    notes: z.string().optional(),
  })).optional(),
});
export type UpdatePurchaseOrderInput = z.infer<typeof UpdatePurchaseOrderInputSchema>;
