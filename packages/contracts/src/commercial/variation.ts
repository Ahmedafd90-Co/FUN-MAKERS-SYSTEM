import { z } from 'zod';

export const CreateVariationInputSchema = z.object({
  projectId: z.string().uuid(),
  subtype: z.enum(['vo', 'change_order']),
  title: z.string().min(1),
  description: z.string().min(1),
  reason: z.string().min(1),
  costImpact: z.number().optional(),
  timeImpactDays: z.number().int().optional(),
  currency: z.string().min(1),
  // VO-specific
  initiatedBy: z.enum(['contractor', 'client']).optional(),
  contractClause: z.string().optional(),
  // CO-specific
  parentVariationId: z.string().uuid().optional(),
  originalContractValue: z.number().optional(),
  adjustmentAmount: z.number().optional(),
  newContractValue: z.number().optional(),
  timeAdjustmentDays: z.number().int().optional(),
});
export type CreateVariationInput = z.infer<typeof CreateVariationInputSchema>;

export const UpdateVariationInputSchema = z.object({
  id: z.string().uuid(),
  title: z.string().min(1).optional(),
  description: z.string().min(1).optional(),
  reason: z.string().min(1).optional(),
  costImpact: z.number().nullable().optional(),
  timeImpactDays: z.number().int().nullable().optional(),
  currency: z.string().min(1).optional(),
  // Assessment fields (Addendum A)
  assessedCostImpact: z.number().nullable().optional(),
  assessedTimeImpactDays: z.number().int().nullable().optional(),
  approvedCostImpact: z.number().nullable().optional(),
  approvedTimeImpactDays: z.number().int().nullable().optional(),
  // VO-specific
  initiatedBy: z.enum(['contractor', 'client']).nullable().optional(),
  contractClause: z.string().nullable().optional(),
  // CO-specific
  parentVariationId: z.string().uuid().nullable().optional(),
  originalContractValue: z.number().nullable().optional(),
  adjustmentAmount: z.number().nullable().optional(),
  newContractValue: z.number().nullable().optional(),
  timeAdjustmentDays: z.number().int().nullable().optional(),
});
export type UpdateVariationInput = z.infer<typeof UpdateVariationInputSchema>;

// Extended list filter for variations — adds subtypeFilter
export const VariationListFilterSchema = z.object({
  subtypeFilter: z.enum(['vo', 'change_order']).optional(),
});
export type VariationListFilter = z.infer<typeof VariationListFilterSchema>;
