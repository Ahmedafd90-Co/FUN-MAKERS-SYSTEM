import { z } from 'zod';

export const CreateIpcInputSchema = z.object({
  projectId: z.string().uuid(),
  ipaId: z.string().uuid(),
  certifiedAmount: z.number(),
  retentionAmount: z.number(),
  adjustments: z.number().optional(),
  netCertified: z.number(),
  certificationDate: z.string().datetime(),
  currency: z.string().min(1),
  remarks: z.string().optional(),
});
export type CreateIpcInput = z.infer<typeof CreateIpcInputSchema>;

export const UpdateIpcInputSchema = z.object({
  id: z.string().uuid(),
  certifiedAmount: z.number().optional(),
  retentionAmount: z.number().optional(),
  adjustments: z.number().nullable().optional(),
  netCertified: z.number().optional(),
  certificationDate: z.string().datetime().optional(),
  currency: z.string().min(1).optional(),
  remarks: z.string().nullable().optional(),
});
export type UpdateIpcInput = z.infer<typeof UpdateIpcInputSchema>;
