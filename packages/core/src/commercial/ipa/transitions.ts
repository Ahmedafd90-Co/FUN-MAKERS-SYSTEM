export const IPA_TRANSITIONS: Record<string, string[]> = {
  draft: ['submitted'],
  // approved_internal is reachable from submitted via workflow convergence
  // (workflow approval shortcuts the manual under_review phase).
  // Manual path: submitted → under_review → approved_internal (legacy, no workflow).
  submitted: ['under_review', 'returned', 'rejected', 'approved_internal'],
  under_review: ['approved_internal', 'returned', 'rejected'],
  returned: ['submitted'],
  approved_internal: ['signed', 'issued'],
  signed: ['issued'],
  issued: ['superseded', 'closed'],
};

/**
 * Actions that are part of the "approval phase" — managed by the workflow
 * engine when a workflow instance is active for the record.
 *
 * When a workflow instance is in_progress or returned for an IPA, these
 * manual actions are BLOCKED at the backend. The workflow step service
 * (approve/return/reject) is the only way to drive the approval phase.
 *
 * Legacy manual approval is still allowed when NO workflow instance exists.
 */
export const IPA_WORKFLOW_MANAGED_ACTIONS = ['review', 'approve', 'reject', 'return'];

export const IPA_TERMINAL_STATUSES = ['rejected', 'superseded', 'closed'];
