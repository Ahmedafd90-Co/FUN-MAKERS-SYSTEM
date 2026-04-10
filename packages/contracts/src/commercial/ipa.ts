import { z } from 'zod';

export const CreateIpaInputSchema = z.object({
  projectId: z.string().uuid(),
  periodNumber: z.number().int().positive(),
  periodFrom: z.string().datetime(),
  periodTo: z.string().datetime(),
  grossAmount: z.number(),
  retentionRate: z.number().min(0).max(1),
  retentionAmount: z.number(),
  previousCertified: z.number(),
  currentClaim: z.number(),
  advanceRecovery: z.number().optional(),
  otherDeductions: z.number().optional(),
  netClaimed: z.number(),
  currency: z.string().min(1),
  description: z.string().optional(),
});
export type CreateIpaInput = z.infer<typeof CreateIpaInputSchema>;

export const UpdateIpaInputSchema = z.object({
  id: z.string().uuid(),
  periodNumber: z.number().int().positive().optional(),
  periodFrom: z.string().datetime().optional(),
  periodTo: z.string().datetime().optional(),
  grossAmount: z.number().optional(),
  retentionRate: z.number().min(0).max(1).optional(),
  retentionAmount: z.number().optional(),
  previousCertified: z.number().optional(),
  currentClaim: z.number().optional(),
  advanceRecovery: z.number().nullable().optional(),
  otherDeductions: z.number().nullable().optional(),
  netClaimed: z.number().optional(),
  currency: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
});
export type UpdateIpaInput = z.infer<typeof UpdateIpaInputSchema>;
