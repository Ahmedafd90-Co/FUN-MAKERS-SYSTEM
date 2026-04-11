import { z } from 'zod';

export const CreateFrameworkAgreementInputSchema = z.object({
  entityId: z.string().uuid(),
  vendorId: z.string().uuid(),
  projectId: z.string().uuid().optional(),
  title: z.string().min(1),
  description: z.string().optional(),
  validFrom: z.string().datetime(),
  validTo: z.string().datetime(),
  currency: z.string().min(1),
  totalCommittedValue: z.number().positive().optional(),
  items: z.array(z.object({
    itemCatalogId: z.string().uuid().optional(),
    itemDescription: z.string().min(1),
    unit: z.string().min(1),
    agreedRate: z.number().positive(),
    currency: z.string().min(1),
    minQuantity: z.number().positive().optional(),
    maxQuantity: z.number().positive().optional(),
    notes: z.string().optional(),
  })).optional(),
});
export type CreateFrameworkAgreementInput = z.infer<typeof CreateFrameworkAgreementInputSchema>;

export const UpdateFrameworkAgreementInputSchema = z.object({
  id: z.string().uuid(),
  title: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  validFrom: z.string().datetime().optional(),
  validTo: z.string().datetime().optional(),
  currency: z.string().min(1).optional(),
  totalCommittedValue: z.number().positive().nullable().optional(),
  items: z.array(z.object({
    itemCatalogId: z.string().uuid().optional(),
    itemDescription: z.string().min(1),
    unit: z.string().min(1),
    agreedRate: z.number().positive(),
    currency: z.string().min(1),
    minQuantity: z.number().positive().optional(),
    maxQuantity: z.number().positive().optional(),
    notes: z.string().optional(),
  })).optional(),
});
export type UpdateFrameworkAgreementInput = z.infer<typeof UpdateFrameworkAgreementInputSchema>;
