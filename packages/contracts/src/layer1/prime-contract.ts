import { z } from 'zod';

// Mirror of Prisma enum PrimeContractStatus — keep in sync with schema.prisma
const primeContractStatusEnum = z.enum([
  'draft',
  'signed',
  'active',
  'completed',
  'terminated',
  'cancelled',
]);

// Date-ordering invariant for create AND update: when present, dates must be
// chronologically non-decreasing. signedDate ≤ effectiveDate ≤ expectedCompletionDate.
function datesOrderedNonDecreasing(data: {
  signedDate?: string | null | undefined;
  effectiveDate?: string | null | undefined;
  expectedCompletionDate?: string | null | undefined;
}): boolean {
  const toDate = (s: string | null | undefined) => (s ? new Date(s) : null);
  const sd = toDate(data.signedDate);
  const ed = toDate(data.effectiveDate);
  const cd = toDate(data.expectedCompletionDate);
  if (sd && ed && sd > ed) return false;
  if (ed && cd && ed > cd) return false;
  if (sd && cd && sd > cd) return false;
  return true;
}

const dateOrderingMessage =
  'Date ordering violated: signedDate ≤ effectiveDate ≤ expectedCompletionDate when all are provided.';

export const CreatePrimeContractInputSchema = z
  .object({
    projectId: z.string().uuid(),
    contractingEntityId: z.string().uuid(),
    clientName: z.string().min(1),
    clientReference: z.string().nullish(),
    contractValue: z.number().positive(),
    contractCurrency: z.string().length(3).optional().default('SAR'),
    signedDate: z.string().datetime().nullish(),
    effectiveDate: z.string().datetime().nullish(),
    expectedCompletionDate: z.string().datetime().nullish(),
    status: primeContractStatusEnum.optional().default('draft'),
    notes: z.string().nullish(),
    createdBy: z.string().uuid(),
  })
  .refine(datesOrderedNonDecreasing, {
    message: dateOrderingMessage,
    path: ['expectedCompletionDate'],
  });
export type CreatePrimeContractInput = z.infer<typeof CreatePrimeContractInputSchema>;

export const UpdatePrimeContractInputSchema = z
  .object({
    projectId: z.string().uuid(),
    contractingEntityId: z.string().uuid().optional(),
    clientName: z.string().min(1).optional(),
    clientReference: z.string().nullish(),
    contractValue: z.number().positive().optional(),
    contractCurrency: z.string().length(3).optional(),
    signedDate: z.string().datetime().nullish(),
    effectiveDate: z.string().datetime().nullish(),
    expectedCompletionDate: z.string().datetime().nullish(),
    status: primeContractStatusEnum.optional(),
    notes: z.string().nullish(),
  })
  .refine(datesOrderedNonDecreasing, {
    message: dateOrderingMessage,
    path: ['expectedCompletionDate'],
  });
export type UpdatePrimeContractInput = z.infer<typeof UpdatePrimeContractInputSchema>;

export const TransitionPrimeContractInputSchema = z.object({
  projectId: z.string().uuid(),
  // Action validated against the state machine in the service layer (PR-A1 Stage 3).
  action: z.string().min(1),
  comment: z.string().nullish(),
});
export type TransitionPrimeContractInput = z.infer<typeof TransitionPrimeContractInputSchema>;
