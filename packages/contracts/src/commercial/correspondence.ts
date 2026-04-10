import { z } from 'zod';

export const CreateCorrespondenceInputSchema = z.object({
  projectId: z.string().uuid(),
  subtype: z.enum(['letter', 'notice', 'claim', 'back_charge']),
  subject: z.string().min(1),
  body: z.string().min(1),
  recipientName: z.string().min(1),
  recipientOrg: z.string().optional(),
  currency: z.string().optional(),
  parentCorrespondenceId: z.string().uuid().optional(),
  // Notice-specific
  noticeType: z.enum(['delay', 'claim_notice', 'extension_of_time', 'dispute', 'force_majeure', 'general']).optional(),
  contractClause: z.string().optional(),
  responseDeadline: z.string().datetime().optional(),
  // Claim-specific
  claimType: z.enum(['time_extension', 'additional_cost', 'time_and_cost']).optional(),
  claimedAmount: z.number().optional(),
  claimedTimeDays: z.number().int().optional(),
  settledAmount: z.number().optional(),
  settledTimeDays: z.number().int().optional(),
  // Back-charge-specific
  targetName: z.string().optional(),
  category: z.enum(['defect', 'delay', 'non_compliance', 'damage', 'other']).optional(),
  chargedAmount: z.number().optional(),
  evidenceDescription: z.string().optional(),
  // Letter-specific
  letterType: z.enum(['instruction', 'response', 'transmittal', 'general']).optional(),
  inReplyToId: z.string().uuid().optional(),
});
export type CreateCorrespondenceInput = z.infer<typeof CreateCorrespondenceInputSchema>;

export const UpdateCorrespondenceInputSchema = z.object({
  id: z.string().uuid(),
  subject: z.string().min(1).optional(),
  body: z.string().min(1).optional(),
  recipientName: z.string().min(1).optional(),
  recipientOrg: z.string().nullable().optional(),
  currency: z.string().nullable().optional(),
  parentCorrespondenceId: z.string().uuid().nullable().optional(),
  // Notice-specific
  noticeType: z.enum(['delay', 'claim_notice', 'extension_of_time', 'dispute', 'force_majeure', 'general']).nullable().optional(),
  contractClause: z.string().nullable().optional(),
  responseDeadline: z.string().datetime().nullable().optional(),
  // Claim-specific
  claimType: z.enum(['time_extension', 'additional_cost', 'time_and_cost']).nullable().optional(),
  claimedAmount: z.number().nullable().optional(),
  claimedTimeDays: z.number().int().nullable().optional(),
  settledAmount: z.number().nullable().optional(),
  settledTimeDays: z.number().int().nullable().optional(),
  // Back-charge-specific
  targetName: z.string().nullable().optional(),
  category: z.enum(['defect', 'delay', 'non_compliance', 'damage', 'other']).nullable().optional(),
  chargedAmount: z.number().nullable().optional(),
  evidenceDescription: z.string().nullable().optional(),
  // Letter-specific
  letterType: z.enum(['instruction', 'response', 'transmittal', 'general']).nullable().optional(),
  inReplyToId: z.string().uuid().nullable().optional(),
});
export type UpdateCorrespondenceInput = z.infer<typeof UpdateCorrespondenceInputSchema>;

// Extended list filter for correspondence — adds subtypeFilter
export const CorrespondenceListFilterSchema = z.object({
  subtypeFilter: z.enum(['letter', 'notice', 'claim', 'back_charge']).optional(),
});
export type CorrespondenceListFilter = z.infer<typeof CorrespondenceListFilterSchema>;
