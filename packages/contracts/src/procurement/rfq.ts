import { z } from 'zod';

/**
 * RFQ contract schemas — aligned with Prisma model.
 *
 * Ghost fields removed (deliveryDate, deliveryLocation, paymentTerms, notes,
 * items[].notes) — these have no Prisma column and were silently dropped on
 * create or would cause errors on update. Stabilization Slice A.
 */
export const CreateRfqInputSchema = z.object({
  projectId: z.string().uuid(),
  title: z.string().min(1),
  description: z.string().optional(),
  categoryId: z.string().uuid().optional(),
  currency: z.string().min(1),
  deadline: z.string().datetime(),
  estimatedBudget: z.number().positive().optional(),
  items: z.array(z.object({
    itemCatalogId: z.string().uuid().optional(),
    itemDescription: z.string().min(1),
    unit: z.string().min(1),
    quantity: z.number().positive(),
    estimatedUnitPrice: z.number().positive().optional(),
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
  estimatedBudget: z.number().positive().nullable().optional(),
  items: z.array(z.object({
    itemCatalogId: z.string().uuid().optional(),
    itemDescription: z.string().min(1),
    unit: z.string().min(1),
    quantity: z.number().positive(),
    estimatedUnitPrice: z.number().positive().optional(),
  })).optional(),
  invitedVendorIds: z.array(z.string().uuid()).optional(),
});
export type UpdateRfqInput = z.infer<typeof UpdateRfqInputSchema>;
