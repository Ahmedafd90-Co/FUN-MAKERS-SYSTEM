/**
 * Workflow contract schemas — shared between client and server.
 *
 * Defines Zod schemas for workflow template configuration, approver rules,
 * and step definitions. The workflow engine is record-type agnostic — these
 * schemas enforce structural correctness without knowledge of any specific
 * business record type.
 */
import { z } from 'zod';

// ---------------------------------------------------------------------------
// Approver rule types
// ---------------------------------------------------------------------------

const RoleApproverRule = z.object({
  type: z.literal('role'),
  roleCode: z.string(),
});

const UserApproverRule = z.object({
  type: z.literal('user'),
  userId: z.string().uuid(),
});

const ProjectRoleApproverRule = z.object({
  type: z.literal('project_role'),
  roleCode: z.string(),
  projectScoped: z.literal(true),
});

// AnyOf uses z.lazy for recursion, so we define the union first then compose.
// discriminatedUnion requires at least two members with a shared literal
// discriminator — 'any_of' is handled via the lazy reference.

/**
 * Base approver rules (non-recursive). Used as the base of the recursive union.
 */
const BaseApproverRules = z.discriminatedUnion('type', [
  RoleApproverRule,
  UserApproverRule,
  ProjectRoleApproverRule,
]);

/**
 * Recursive approver rule schema. Supports:
 * - `role`          — any user holding the named role
 * - `user`          — a specific user by UUID
 * - `project_role`  — any user holding the named role scoped to the project
 * - `any_of`        — union of multiple sub-rules (recursive)
 */
export const ApproverRuleSchema: z.ZodType<ApproverRule> = z.lazy(() =>
  z.union([
    RoleApproverRule,
    UserApproverRule,
    ProjectRoleApproverRule,
    z.object({
      type: z.literal('any_of'),
      rules: z.array(ApproverRuleSchema).min(1),
    }),
  ]),
);

// ---------------------------------------------------------------------------
// Approver rule inferred type
// ---------------------------------------------------------------------------

export type ApproverRule =
  | { type: 'role'; roleCode: string }
  | { type: 'user'; userId: string }
  | { type: 'project_role'; roleCode: string; projectScoped: true }
  | { type: 'any_of'; rules: ApproverRule[] };

// ---------------------------------------------------------------------------
// Template config
// ---------------------------------------------------------------------------

export const WorkflowTemplateConfigSchema = z.object({
  allowComment: z.boolean().default(true),
  allowReturn: z.boolean().default(true),
  allowOverride: z.boolean().default(true),
});

export type WorkflowTemplateConfig = z.infer<typeof WorkflowTemplateConfigSchema>;

// ---------------------------------------------------------------------------
// Step definition (used when creating/updating templates)
// ---------------------------------------------------------------------------

export const WorkflowStepDefSchema = z.object({
  orderIndex: z.number().int().positive(),
  name: z.string().min(1),
  approverRule: ApproverRuleSchema,
  slaHours: z.number().int().positive().nullable().optional(),
  isOptional: z.boolean().default(false),
  requirementFlags: z.record(z.unknown()).default({}),
});

export type WorkflowStepDef = z.infer<typeof WorkflowStepDefSchema>;
export type WorkflowStepDefInput = z.input<typeof WorkflowStepDefSchema>;

// ---------------------------------------------------------------------------
// Input schemas for template CRUD
// ---------------------------------------------------------------------------

export const CreateWorkflowTemplateSchema = z.object({
  code: z.string().min(1),
  name: z.string().min(1),
  recordType: z.string().min(1),
  config: WorkflowTemplateConfigSchema.optional().default({
    allowComment: true,
    allowReturn: true,
    allowOverride: true,
  }),
  steps: z.array(WorkflowStepDefSchema).min(1),
  createdBy: z.string().uuid(),
});

export type CreateWorkflowTemplateInput = z.input<typeof CreateWorkflowTemplateSchema>;

export const UpdateWorkflowTemplateSchema = z.object({
  name: z.string().min(1).optional(),
  config: WorkflowTemplateConfigSchema.optional(),
  steps: z.array(WorkflowStepDefSchema).min(1).optional(),
  updatedBy: z.string().uuid(),
});

export type UpdateWorkflowTemplateInput = z.input<typeof UpdateWorkflowTemplateSchema>;

// ---------------------------------------------------------------------------
// Input schemas for instance + step actions
// ---------------------------------------------------------------------------

export const StartWorkflowInstanceSchema = z.object({
  templateCode: z.string().min(1),
  recordType: z.string().min(1),
  recordId: z.string().min(1),
  projectId: z.string().uuid(),
  startedBy: z.string().uuid(),
});

export type StartWorkflowInstanceInput = z.infer<typeof StartWorkflowInstanceSchema>;

export const ApproveStepSchema = z.object({
  instanceId: z.string().uuid(),
  stepId: z.string().uuid(),
  actorUserId: z.string().uuid(),
  comment: z.string().optional(),
});

export type ApproveStepInput = z.infer<typeof ApproveStepSchema>;

export const RejectStepSchema = z.object({
  instanceId: z.string().uuid(),
  stepId: z.string().uuid(),
  actorUserId: z.string().uuid(),
  comment: z.string().min(1, 'Comment is required for rejection.'),
});

export type RejectStepInput = z.infer<typeof RejectStepSchema>;

export const ReturnStepSchema = z.object({
  instanceId: z.string().uuid(),
  stepId: z.string().uuid(),
  actorUserId: z.string().uuid(),
  comment: z.string().min(1, 'Comment is required for return.'),
  returnToStepId: z.string().uuid().optional(),
});

export type ReturnStepInput = z.infer<typeof ReturnStepSchema>;

export const CancelInstanceSchema = z.object({
  instanceId: z.string().uuid(),
  actorUserId: z.string().uuid(),
  reason: z.string().min(1, 'Reason is required for cancellation.'),
});

export type CancelInstanceInput = z.infer<typeof CancelInstanceSchema>;

// ---------------------------------------------------------------------------
// Workflow event types
// ---------------------------------------------------------------------------

export type WorkflowEventName =
  | 'workflow.started'
  | 'workflow.stepApproved'
  | 'workflow.approved'
  | 'workflow.rejected'
  | 'workflow.returned'
  | 'workflow.cancelled';

export type WorkflowEventPayload = {
  instanceId: string;
  templateCode: string;
  recordType: string;
  recordId: string;
  projectId: string;
  actorUserId: string;
  stepName?: string | undefined;
  comment?: string | undefined;
};

// ---------------------------------------------------------------------------
// Workflow status enum (mirrors Prisma WorkflowStatus)
// ---------------------------------------------------------------------------

export const WorkflowStatusValues = [
  'draft',
  'in_progress',
  'returned',
  'approved',
  'rejected',
  'cancelled',
  'completed',
  'on_hold',
] as const;

export type WorkflowStatus = (typeof WorkflowStatusValues)[number];
