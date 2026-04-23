/**
 * Expense status transitions.
 *
 * Module 3 Procurement Engine — Expense lifecycle.
 *
 * draft -> submitted -> approved -> paid -> closed
 *                    -> rejected
 *                    -> returned -> submitted (re-submit)
 *       approved -> cancelled
 *
 * 'approved', 'reject', 'return' are workflow-managed actions (see
 * EXPENSE_WORKFLOW_MANAGED_ACTIONS below) — blocked at the service layer
 * when a workflow instance is active.
 */

export const EXPENSE_TRANSITIONS: Record<string, string[]> = {
  // 'approved' is reachable from 'submitted' via workflow convergence.
  // Manual path (approve, reject, return) is blocked when a workflow instance
  // is active — see EXPENSE_WORKFLOW_MANAGED_ACTIONS below.
  draft: ['submitted'],
  submitted: ['approved', 'rejected', 'returned'],
  returned: ['submitted'],
  approved: ['paid', 'cancelled'],
  paid: ['closed'],
};

export const EXPENSE_TERMINAL_STATUSES = ['rejected', 'cancelled', 'closed'];

export const EXPENSE_ACTION_TO_STATUS: Record<string, string> = {
  submit: 'submitted',
  approve: 'approved',
  reject: 'rejected',
  return: 'returned',
  pay: 'paid',
  cancel: 'cancelled',
  close: 'closed',
};

/**
 * Actions that are part of the "approval phase" — managed by the workflow
 * engine when a workflow instance is active for the record.
 *
 * When a workflow instance is in_progress or returned for an Expense, these
 * manual actions are BLOCKED at the service layer. The workflow step service
 * (approve / return / reject) is the only way to drive the approval phase.
 *
 * Legacy manual approval is still allowed when NO workflow instance exists
 * (e.g. a project configured without an Expense workflow template).
 */
export const EXPENSE_WORKFLOW_MANAGED_ACTIONS = ['approve', 'reject', 'return'];

/**
 * Statuses where the expense amount counts toward the actual_cost KPI.
 * Once approved, the spend is considered committed — paid and closed
 * are subsequent settlement states that don't change the committed amount.
 */
export const EXPENSE_APPROVED_PLUS_STATUSES = ['approved', 'paid', 'closed'];
