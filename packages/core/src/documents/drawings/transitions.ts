/**
 * DrawingRevision status state machine (PIC-52).
 *
 * Lifecycle: for_information → for_approval → for_construction → superseded
 *
 * Transition policy:
 *   - for_information  →  for_approval     (user submits the revision)
 *   - for_approval     →  for_construction (workflow.approved fires → convergence handler)
 *   - for_construction →  superseded       (newer revision reaches for_construction)
 *   - terminal: superseded
 *
 * Workflow-returned / rejected events do NOT change DrawingRevisionStatus in v1
 * (the entity stays in for_approval; workflow_instance.status carries the
 * workflow-level outcome). Same pattern as tax_invoice / credit_note convergence.
 * A team responding to a rejection creates a new revision rather than transitioning
 * the rejected one — preserves the audit trail of what was rejected vs accepted.
 */

import type { DrawingRevisionStatus } from '@fmksa/db';

/**
 * Valid status transitions, indexed by current status.
 * The transition service refuses any (from → to) pair not listed here.
 */
export const DRAWING_REVISION_TRANSITIONS: Record<
  DrawingRevisionStatus,
  readonly DrawingRevisionStatus[]
> = {
  for_information: ['for_approval'],
  for_approval: ['for_construction'],
  for_construction: ['superseded'],
  superseded: [],
} as const;

/** Statuses past which no further transition is allowed. */
export const DRAWING_REVISION_TERMINAL_STATUSES: readonly DrawingRevisionStatus[] = [
  'superseded',
];

/**
 * User-triggered actions → target status.
 *
 * `submit` is the only user-triggered transition. `for_construction` and
 * `superseded` are workflow- or system-triggered (convergence handler /
 * service-layer supersession on new-revision-approved), NOT user-callable.
 *
 * PIC-35 Step 6 discipline: workflow-managed transitions cannot be invoked
 * manually. The list below intentionally excludes the workflow-triggered
 * transitions; the transition service refuses any action that targets a
 * workflow-managed status when called from user code (matches the Expense /
 * PO / IPA pattern).
 */
export const DRAWING_REVISION_ACTION_TO_STATUS: Record<string, DrawingRevisionStatus> = {
  submit: 'for_approval',
};

/**
 * Actions that the workflow engine OWNS — manual invocation is refused
 * unconditionally per the PIC-35 Step 6 contract. Empty for DrawingRevision
 * because all workflow-managed status writes happen via the convergence
 * handler in `convergence-handlers.ts` (not via this action map), and
 * supersession is a system-internal write (not user-callable).
 */
export const DRAWING_REVISION_WORKFLOW_MANAGED_ACTIONS: readonly string[] = [];
