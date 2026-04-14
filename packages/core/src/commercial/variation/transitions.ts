export const VO_TRANSITIONS: Record<string, string[]> = {
  draft: ['submitted'],
  submitted: ['under_review', 'returned', 'rejected', 'approved_internal'],
  under_review: ['approved_internal', 'returned', 'rejected'],
  returned: ['submitted'],
  approved_internal: ['signed'],
  signed: ['issued'],
  issued: ['client_pending', 'superseded', 'closed'],
  client_pending: ['client_approved', 'client_rejected'],
  client_approved: ['closed'],
};

export const CO_TRANSITIONS: Record<string, string[]> = {
  draft: ['submitted'],
  submitted: ['under_review', 'returned', 'rejected', 'approved_internal'],
  under_review: ['approved_internal', 'returned', 'rejected'],
  returned: ['submitted'],
  approved_internal: ['signed'],
  signed: ['issued'],
  issued: ['superseded', 'closed'],
};

export const VARIATION_TERMINAL_STATUSES = [
  'rejected',
  'client_rejected',
  'superseded',
  'closed',
];

/**
 * Actions managed by the workflow engine when a workflow instance is active.
 * Blocked at the backend and hidden from the UI.
 */
export const VARIATION_WORKFLOW_MANAGED_ACTIONS = ['review', 'approve', 'reject', 'return'];

export function getVariationTransitions(
  subtype: 'vo' | 'change_order',
): Record<string, string[]> {
  return subtype === 'vo' ? VO_TRANSITIONS : CO_TRANSITIONS;
}
