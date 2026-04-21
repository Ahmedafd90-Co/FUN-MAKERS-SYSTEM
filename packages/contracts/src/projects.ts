/**
 * Project contract schemas — shared between client and server.
 */
import { z } from 'zod';

// ---------------------------------------------------------------------------
// Input schemas
// ---------------------------------------------------------------------------

export const CreateProjectSchema = z.object({
  code: z.string().min(1, 'Project code is required.'),
  name: z.string().min(1, 'Project name is required.'),
  entityId: z.string().uuid('Invalid entity ID.'),
  currencyCode: z.string().min(1, 'Currency code is required.'),
  startDate: z.coerce.date(),
  endDate: z.coerce.date().optional().nullable(),
  // Phase D2 — financial control baseline
  contractValue: z.number().positive().optional().nullable(),
});

export type CreateProjectInput = z.infer<typeof CreateProjectSchema>;

export const UpdateProjectSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).optional(),
  entityId: z.string().uuid().optional(),
  currencyCode: z.string().min(1).optional(),
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional().nullable(),
  status: z.enum(['active', 'on_hold', 'completed']).optional(),
  // Phase D2 — financial control baseline
  contractValue: z.number().positive().optional().nullable(),
  revisedContractValue: z.number().positive().optional().nullable(),
});

export type UpdateProjectInput = z.infer<typeof UpdateProjectSchema>;

export const ArchiveProjectSchema = z.object({
  id: z.string().uuid(),
  reason: z.string().min(1, 'Reason is required.'),
});

export type ArchiveProjectInput = z.infer<typeof ArchiveProjectSchema>;

export const GetProjectSchema = z.object({
  id: z.string().uuid(),
  projectId: z.string().uuid(),
});

export const ListProjectsSchema = z.object({
  includeArchived: z.boolean().optional().default(false),
  /**
   * When false (default), exclude projects whose code matches vitest
   * fixture patterns (PROJ-*, PRJ-*, AC-*, TEST-*). Opt in when
   * debugging test projects from the admin surface.
   */
  includeTestProjects: z.boolean().optional().default(false),
});

export type ListProjectsInput = z.infer<typeof ListProjectsSchema>;

// ---------------------------------------------------------------------------
// Settings schemas
// ---------------------------------------------------------------------------

export const GetProjectSettingSchema = z.object({
  projectId: z.string().uuid(),
  key: z.string().min(1),
});

export const SetProjectSettingSchema = z.object({
  projectId: z.string().uuid(),
  key: z.string().min(1),
  value: z.unknown(),
});

export const GetAllProjectSettingsSchema = z.object({
  projectId: z.string().uuid(),
});

// ---------------------------------------------------------------------------
// Assignment schemas
// ---------------------------------------------------------------------------

export const AssignProjectSchema = z.object({
  projectId: z.string().uuid(),
  userId: z.string().uuid(),
  roleId: z.string().uuid(),
  effectiveFrom: z.coerce.date(),
  effectiveTo: z.coerce.date().optional().nullable(),
});

export type AssignProjectInput = z.infer<typeof AssignProjectSchema>;

export const RevokeAssignmentSchema = z.object({
  assignmentId: z.string().uuid(),
  reason: z.string().min(1, 'Reason is required.'),
});

export type RevokeAssignmentInput = z.infer<typeof RevokeAssignmentSchema>;

export const ListAssignmentsSchema = z.object({
  projectId: z.string().uuid(),
  at: z.coerce.date().optional(),
});

export type ListAssignmentsInput = z.infer<typeof ListAssignmentsSchema>;
