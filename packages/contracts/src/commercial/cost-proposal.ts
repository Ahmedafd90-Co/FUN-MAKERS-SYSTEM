import { z } from 'zod';

export const CreateCostProposalInputSchema = z.object({
  projectId: z.string().uuid(),
  variationId: z.string().uuid().optional(),
  revisionNumber: z.number().int().positive(),
  estimatedCost: z.number(),
  estimatedTimeDays: z.number().int().optional(),
  methodology: z.string().optional(),
  costBreakdown: z.string().optional(),
  currency: z.string().min(1),
});
export type CreateCostProposalInput = z.infer<typeof CreateCostProposalInputSchema>;

export const UpdateCostProposalInputSchema = z.object({
  id: z.string().uuid(),
  variationId: z.string().uuid().nullable().optional(),
  revisionNumber: z.number().int().positive().optional(),
  estimatedCost: z.number().optional(),
  estimatedTimeDays: z.number().int().nullable().optional(),
  methodology: z.string().nullable().optional(),
  costBreakdown: z.string().nullable().optional(),
  currency: z.string().min(1).optional(),
  // Assessment fields (Addendum A)
  assessedCost: z.number().nullable().optional(),
  assessedTimeDays: z.number().int().nullable().optional(),
  approvedCost: z.number().nullable().optional(),
  approvedTimeDays: z.number().int().nullable().optional(),
});
export type UpdateCostProposalInput = z.infer<typeof UpdateCostProposalInputSchema>;
