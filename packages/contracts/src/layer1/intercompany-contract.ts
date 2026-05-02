import { z } from 'zod';

// Mirror of Prisma enum IntercompanyPricingType — keep in sync with schema.prisma
const intercompanyPricingTypeEnum = z.enum([
  'cost_plus_markup',
  'management_fee',
  'fixed_fee',
]);

// Mirror of Prisma enum IntercompanyManagingDepartment — keep in sync with schema.prisma
const intercompanyManagingDepartmentEnum = z.enum([
  'me_contract',
  'asia_pac_contract',
]);

// Mirror of Prisma enum IntercompanyContractStatus — keep in sync with schema.prisma
const intercompanyContractStatusEnum = z.enum([
  'draft',
  'signed',
  'active',
  'closed',
  'cancelled',
]);

export const CreateIntercompanyContractInputSchema = z
  .object({
    projectId: z.string().uuid(),
    fromEntityId: z.string().uuid(),
    toEntityId: z.string().uuid(),
    scope: z.string().min(1),
    pricingType: intercompanyPricingTypeEnum,
    markupPercent: z.number().nonnegative(),
    contractValue: z.number().positive().nullish(),
    contractCurrency: z.string().length(3).optional().default('SAR'),
    managingDepartment: intercompanyManagingDepartmentEnum,
    signedDate: z.string().datetime().nullish(),
    status: intercompanyContractStatusEnum.optional().default('draft'),
    notes: z.string().nullish(),
    createdBy: z.string().uuid(),
  })
  .refine((data) => data.fromEntityId !== data.toEntityId, {
    message: 'fromEntityId and toEntityId must be different (no self-contracts).',
    path: ['toEntityId'],
  });
export type CreateIntercompanyContractInput = z.infer<typeof CreateIntercompanyContractInputSchema>;

export const UpdateIntercompanyContractInputSchema = z.object({
  id: z.string().uuid(),
  projectId: z.string().uuid(),
  // fromEntityId / toEntityId intentionally absent — entities immutable per PIC-8 spec.
  scope: z.string().min(1).optional(),
  pricingType: intercompanyPricingTypeEnum.optional(),
  markupPercent: z.number().nonnegative().optional(),
  contractValue: z.number().positive().nullish(),
  contractCurrency: z.string().length(3).optional(),
  managingDepartment: intercompanyManagingDepartmentEnum.optional(),
  signedDate: z.string().datetime().nullish(),
  status: intercompanyContractStatusEnum.optional(),
  notes: z.string().nullish(),
});
export type UpdateIntercompanyContractInput = z.infer<typeof UpdateIntercompanyContractInputSchema>;

export const ListIntercompanyContractsFilterSchema = z.object({
  projectId: z.string().uuid(),
  managingDepartment: intercompanyManagingDepartmentEnum.optional(),
  status: intercompanyContractStatusEnum.optional(),
  fromEntityId: z.string().uuid().optional(),
  toEntityId: z.string().uuid().optional(),
});
export type ListIntercompanyContractsFilter = z.infer<typeof ListIntercompanyContractsFilterSchema>;

export const TransitionIntercompanyContractInputSchema = z.object({
  id: z.string().uuid(),
  projectId: z.string().uuid(),
  // Action validated against the state machine in the service layer (PR-A1 Stage 3).
  action: z.string().min(1),
  comment: z.string().nullish(),
});
export type TransitionIntercompanyContractInput = z.infer<typeof TransitionIntercompanyContractInputSchema>;
