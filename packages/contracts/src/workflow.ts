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
  /** Step outcome semantics: review, approve, sign, issue, acknowledge. */
  outcomeType: z.enum(['review', 'approve', 'sign', 'issue', 'acknowledge']).default('approve'),
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

// ---------------------------------------------------------------------------
// PIC-50 — Workflow template registry (canonical recordType → template-code mapping)
//
// Declares how a workflow-managed recordType maps to its template codes. The
// system-default fallback in template-resolution.ts (`packages/core/src/workflow/`)
// looks up this registry to construct the expected `${prefix}_standard` /
// `${prefix}_high_value` code instead of relying on a string-`endsWith` heuristic.
// The heuristic was policy-by-accident — `endsWith: '_standard'` returns whichever
// template alphabetically wins per recordType, which works today only because
// no two registered templates per recordType end in the same suffix. One additional
// template would silently break it (the PIC-50 class — same shape as PIC-41's
// "alphabetical-first accident routed 100% of Expenses/POs to PD approval").
//
// Two modes are declared explicitly:
//
//   - `standard-default`: the resolver expects a `${prefix}_standard` template
//     in seed (and optionally `${prefix}_high_value` for PIC-41 amount-triggered
//     escalation). 12 of 13 workflow-managed entities follow this mode.
//
//   - `subtype-driven`: the entity has NO single canonical template. Templates
//     are `${subtype}_*` (e.g. correspondence's `letter_*` / `claim_*` /
//     `notice_*` / `back_charge_*`). The resolver requires the caller to pass
//     `subtype`; calls without subtype return null rather than silently
//     falling through to an alphabetical accident. Closes a latent
//     financial-control mis-routing path the recon found (a no-subtype call
//     on `correspondence` would previously return `back_charge_standard`
//     alphabetically — wrong approval tier).
//
// To add a new workflow-managed entity, do ALL THREE atomically in ONE PR:
//
//   1. APPEND the Pascal-case model to `WORKFLOW_DRIVEN_MODELS` in
//      `packages/db/src/middleware/no-direct-status-write.ts`.
//   2. ADD a registry entry below for the snake_case recordType:
//        `'my_entity': { mode: 'standard-default', prefix: 'my_entity' }`
//      (or `prefix: 'something_else'` if a non-convention abbreviation is
//      genuinely required — like PO's `po` — but document the why inline).
//   3. SEED the `${prefix}_standard` workflow template (and the
//      `${prefix}_high_value` variant if Pico Play's DoA matrix calls for
//      amount-triggered escalation).
//
// The parity-guard test at
// `packages/core/tests/workflow/template-registry-parity.test.ts` WILL fail
// if (1) was done without (2), if (2) was done without (3), or if a
// subtype-driven recordType somehow gets resolved without a subtype. This
// is intentional — drift between WORKFLOW_DRIVEN_MODELS, the registry, and
// the seed is the PIC-50 class of silent-mis-resolution at this layer, and
// we catch it structurally rather than by human discipline.
//
// `endsWith` heuristics: deleted by PIC-50. The resolver no longer uses
// suffix matching for tier-3 (PIC-41 amount escalation) or tier-4 (generic
// fallback) — the registry's `prefix` is the source of truth.
// ---------------------------------------------------------------------------

export type WorkflowTemplateRegistryEntry =
  | { mode: 'standard-default'; prefix: string }
  | { mode: 'subtype-driven' };

export const WORKFLOW_TEMPLATE_REGISTRY = {
  ipa: { mode: 'standard-default', prefix: 'ipa' },
  ipc: { mode: 'standard-default', prefix: 'ipc' },
  variation: { mode: 'standard-default', prefix: 'variation' },
  expense: { mode: 'standard-default', prefix: 'expense' },

  // PurchaseOrder uses the legacy `po_*` prefix (the abbreviation predates
  // the convention). PIC-41 inline-patched this with an `endsWith` heuristic;
  // PIC-50 makes the non-convention mapping explicit so the heuristic can die.
  // A rename to `purchase_order_*` is an optional hygiene backlog item — not
  // coupled to the correctness fix here, and would require a data migration
  // (workflow_instance.templateCode rows + any project-setting references).
  purchase_order: { mode: 'standard-default', prefix: 'po' },

  rfq: { mode: 'standard-default', prefix: 'rfq' },
  supplier_invoice: { mode: 'standard-default', prefix: 'supplier_invoice' },
  cost_proposal: { mode: 'standard-default', prefix: 'cost_proposal' },
  tax_invoice: { mode: 'standard-default', prefix: 'tax_invoice' },
  vendor_contract: { mode: 'standard-default', prefix: 'vendor_contract' },
  framework_agreement: { mode: 'standard-default', prefix: 'framework_agreement' },
  credit_note: { mode: 'standard-default', prefix: 'credit_note' },

  // Correspondence is subtype-driven by design — templates are `${subtype}_*`
  // (`letter_standard`, `claim_standard`, `notice_standard`, `back_charge_standard`,
  // plus the override variants). There is NO `correspondence_standard` in seed.
  //
  // The resolver requires the caller to pass `subtype` for this recordType.
  // A call without subtype returns null instead of silently falling through —
  // closes a latent financial-control mis-routing where the old `endsWith`
  // heuristic would have returned `back_charge_standard` alphabetically
  // (the wrong approval tier; back-charges route through Finance).
  correspondence: { mode: 'subtype-driven' },
} as const satisfies Record<string, WorkflowTemplateRegistryEntry>;

export type WorkflowRecordType = keyof typeof WORKFLOW_TEMPLATE_REGISTRY;
