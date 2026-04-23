/**
 * Purchase Order status transitions.
 *
 * Module 3 Procurement Engine — PO lifecycle.
 */

export const PO_TRANSITIONS: Record<string, string[]> = {
  draft: ['submitted'],
  // 'approved' is reachable from 'submitted' via workflow convergence.
  // Manual path (approve, reject, return) is blocked when a workflow instance
  // is active — see PO_WORKFLOW_MANAGED_ACTIONS below.
  submitted: ['approved', 'rejected', 'returned'],
  returned: ['submitted', 'cancelled'],
  approved: ['issued', 'cancelled'],
  issued: ['partially_delivered', 'delivered', 'cancelled'],
  partially_delivered: ['delivered'],
  delivered: ['closed'],
};

export const PO_TERMINAL_STATUSES = ['rejected', 'cancelled', 'closed'];

export const PO_ACTION_TO_STATUS: Record<string, string> = {
  submit: 'submitted',
  approve: 'approved',
  reject: 'rejected',
  return: 'returned',
  issue: 'issued',
  partial_deliver: 'partially_delivered',
  deliver: 'delivered',
  cancel: 'cancelled',
  close: 'closed',
};

/**
 * Actions that are part of the "approval phase" — managed by the workflow
 * engine when a workflow instance is active for the record.
 *
 * When a workflow instance is in_progress or returned for a PO, these manual
 * actions are BLOCKED at the service layer. The workflow step service
 * (approve / return / reject) is the only way to drive the approval phase.
 *
 * Legacy manual approval is still allowed when NO workflow instance exists
 * (e.g. a project configured without a PO workflow template).
 */
export const PO_WORKFLOW_MANAGED_ACTIONS = ['approve', 'reject', 'return'];

/**
 * Statuses that count toward committed_cost KPI.
 * Once a PO reaches "approved" or beyond (excluding terminal rejections/cancellations),
 * its value is considered a committed cost for the project.
 */
export const PO_APPROVED_PLUS_STATUSES = [
  'approved',
  'issued',
  'partially_delivered',
  'delivered',
  'closed',
];
