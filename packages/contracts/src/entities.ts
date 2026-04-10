/**
 * Entity contract schemas — shared between client and server.
 */
import { z } from 'zod';

// ---------------------------------------------------------------------------
// Shared enums
// ---------------------------------------------------------------------------

export const EntityTypeEnum = z.enum([
  'parent',
  'subsidiary',
  'sister_company',
  'branch',
  'operating_unit',
  'shared_service_entity',
]);

export const EntityStatusEnum = z.enum(['active', 'inactive', 'archived']);

// ---------------------------------------------------------------------------
// Input schemas
// ---------------------------------------------------------------------------

export const CreateEntitySchema = z.object({
  code: z.string().min(1, 'Entity code is required.'),
  name: z.string().min(1, 'Entity name is required.'),
  type: EntityTypeEnum,
  parentEntityId: z.string().uuid().optional().nullable(),
  status: z.enum(['active', 'inactive']).optional(),
  metadata: z.record(z.unknown()).optional().nullable(),
});

export type CreateEntityInput = z.infer<typeof CreateEntitySchema>;

export const UpdateEntitySchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).optional(),
  type: EntityTypeEnum.optional(),
  parentEntityId: z.string().uuid().optional().nullable(),
  status: z.enum(['active', 'inactive']).optional(),
  metadata: z.record(z.unknown()).optional().nullable(),
});

export type UpdateEntityInput = z.infer<typeof UpdateEntitySchema>;

export const ArchiveEntitySchema = z.object({
  id: z.string().uuid(),
  reason: z.string().min(1, 'Reason is required.'),
});

export type ArchiveEntityInput = z.infer<typeof ArchiveEntitySchema>;

export const GetEntitySchema = z.object({
  id: z.string().uuid(),
});

export const ListEntitiesSchema = z.object({
  includeArchived: z.boolean().optional().default(false),
});

export const EntityIdSchema = z.object({
  entityId: z.string().uuid(),
});
