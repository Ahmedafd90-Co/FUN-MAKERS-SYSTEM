import { z } from 'zod';

// Mirror of Prisma enum ProjectParticipantRole — keep in sync with schema.prisma
const projectParticipantRoleEnum = z.enum([
  'prime_contractor',
  'sub_contractor',
  'factory',
  'design',
  'management',
  'other',
]);

export const CreateProjectParticipantInputSchema = z.object({
  projectId: z.string().uuid(),
  entityId: z.string().uuid(),
  role: projectParticipantRoleEnum,
  isPrime: z.boolean().optional().default(false),
  notes: z.string().nullish(),
  createdBy: z.string().uuid(),
});
export type CreateProjectParticipantInput = z.infer<typeof CreateProjectParticipantInputSchema>;

export const UpdateProjectParticipantInputSchema = z.object({
  id: z.string().uuid(),
  projectId: z.string().uuid(),
  // entityId intentionally absent — immutable per PIC-8 spec
  role: projectParticipantRoleEnum.optional(),
  notes: z.string().nullish(),
});
export type UpdateProjectParticipantInput = z.infer<typeof UpdateProjectParticipantInputSchema>;

export const ListProjectParticipantsFilterSchema = z.object({
  projectId: z.string().uuid(),
  role: projectParticipantRoleEnum.optional(),
});
export type ListProjectParticipantsFilter = z.infer<typeof ListProjectParticipantsFilterSchema>;
