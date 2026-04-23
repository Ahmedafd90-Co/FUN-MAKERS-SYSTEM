/**
 * Supplier Invoice status transitions.
 *
 * Module 3 Procurement Engine — SI lifecycle.
 */

export const SI_TRANSITIONS: Record<string, string[]> = {
  received: ['under_review'],
  under_review: ['approved', 'disputed', 'rejected'],
  approved: ['paid'],
  disputed: ['under_review', 'rejected'],
  paid: ['closed'],
};

export const SI_TERMINAL_STATUSES = ['rejected', 'closed'];

export const SI_ACTION_TO_STATUS: Record<string, string> = {
  review: 'under_review',
  approve: 'approved',
  reject: 'rejected',
  dispute: 'disputed',
  pay: 'paid',
  close: 'closed',
};

/**
 * Statuses that count toward actual_cost KPI.
 * Once a supplier invoice is approved, its value is recognized as
 * actual cost for the project.
 */
export const SI_APPROVED_PLUS_STATUSES = [
  'approved',
  'paid',
  'closed',
];

/**
 * Actions that are part of the "approval phase" — managed by the workflow
 * engine when a workflow instance is active for the record.
 *
 * When a workflow instance is in_progress or returned for an SI, these manual
 * actions are BLOCKED at the service layer. The workflow step service
 * (approve / return / reject) is the only way to drive the approval phase.
 *
 * 'dispute' here plays the role that 'return' plays for PO — workflow return
 * drives the SI to 'disputed' status, which is the existing "needs revision
 * or has an issue" state. Option A semantics: disputed = workflow-returned OR
 * operator-flagged; one state, unified meaning.
 *
 * Legacy manual approval is still allowed when NO workflow instance exists
 * (e.g. a project configured without an SI workflow template).
 */
export const SI_WORKFLOW_MANAGED_ACTIONS = ['approve', 'reject', 'dispute'];
