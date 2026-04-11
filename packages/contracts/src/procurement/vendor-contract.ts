import { z } from 'zod';

export const CreateVendorContractInputSchema = z.object({
  entityId: z.string().uuid(),
  vendorId: z.string().uuid(),
  projectId: z.string().uuid().optional(),
  title: z.string().min(1),
  description: z.string().optional(),
  contractType: z.string().min(1),
  startDate: z.string().datetime(),
  endDate: z.string().datetime(),
  currency: z.string().min(1),
  totalValue: z.number().positive(),
  paymentTerms: z.string().optional(),
  retentionRate: z.number().min(0).max(1).optional(),
  penaltyClause: z.string().optional(),
  notes: z.string().optional(),
  parentContractId: z.string().uuid().optional(),
});
export type CreateVendorContractInput = z.infer<typeof CreateVendorContractInputSchema>;

export const UpdateVendorContractInputSchema = z.object({
  id: z.string().uuid(),
  title: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  contractType: z.string().min(1).optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  currency: z.string().min(1).optional(),
  totalValue: z.number().positive().optional(),
  paymentTerms: z.string().nullable().optional(),
  retentionRate: z.number().min(0).max(1).nullable().optional(),
  penaltyClause: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
});
export type UpdateVendorContractInput = z.infer<typeof UpdateVendorContractInputSchema>;
