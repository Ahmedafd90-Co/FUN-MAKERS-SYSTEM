import { z } from 'zod';

export const CreateRfqInputSchema = z.object({
  projectId: z.string().uuid(),
  title: z.string().min(1),
  description: z.string().optional(),
  categoryId: z.string().uuid().optional(),
  currency: z.string().min(1),
  deadline: z.string().datetime(),
  deliveryDate: z.string().datetime().optional(),
  deliveryLocation: z.string().optional(),
  paymentTerms: z.string().optional(),
  notes: z.string().optional(),
  estimatedBudget: z.number().positive().optional(),
  items: z.array(z.object({
    itemCatalogId: z.string().uuid().optional(),
    itemDescription: z.string().min(1),
    unit: z.string().min(1),
    quantity: z.number().positive(),
    estimatedUnitPrice: z.number().positive().optional(),
    notes: z.string().optional(),
  })).optional(),
  invitedVendorIds: z.array(z.string().uuid()).optional(),
});
export type CreateRfqInput = z.infer<typeof CreateRfqInputSchema>;

export const UpdateRfqInputSchema = z.object({
  id: z.string().uuid(),
  title: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  categoryId: z.string().uuid().nullable().optional(),
  currency: z.string().min(1).optional(),
  deadline: z.string().datetime().optional(),
  deliveryDate: z.string().datetime().nullable().optional(),
  deliveryLocation: z.string().nullable().optional(),
  paymentTerms: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  items: z.array(z.object({
    itemCatalogId: z.string().uuid().optional(),
    itemDescription: z.string().min(1),
    unit: z.string().min(1),
    quantity: z.number().positive(),
    estimatedUnitPrice: z.number().positive().optional(),
    notes: z.string().optional(),
  })).optional(),
  invitedVendorIds: z.array(z.string().uuid()).optional(),
});
export type UpdateRfqInput = z.infer<typeof UpdateRfqInputSchema>;
