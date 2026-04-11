import { z } from 'zod';

export const CreateCategoryInputSchema = z.object({
  entityId: z.string().uuid(),
  name: z.string().min(1),
  code: z.string().min(1).optional(),
  parentId: z.string().uuid().optional(),
  description: z.string().optional(),
  notes: z.string().optional(),
});
export type CreateCategoryInput = z.infer<typeof CreateCategoryInputSchema>;

export const UpdateCategoryInputSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).optional(),
  code: z.string().min(1).nullable().optional(),
  parentId: z.string().uuid().nullable().optional(),
  description: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
});
export type UpdateCategoryInput = z.infer<typeof UpdateCategoryInputSchema>;
