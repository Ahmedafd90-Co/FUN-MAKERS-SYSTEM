/**
 * Expense status transitions.
 *
 * Module 3 Procurement Engine — Expense lifecycle.
 *
 * draft -> submitted -> approved -> paid -> closed
 *                    -> rejected
 *                    -> cancelled
 */

export const EXPENSE_TRANSITIONS: Record<string, string[]> = {
  draft: ['submitted'],
  submitted: ['approved', 'rejected'],
  approved: ['paid', 'cancelled'],
  paid: ['closed'],
};

export const EXPENSE_TERMINAL_STATUSES = ['rejected', 'cancelled', 'closed'];

export const EXPENSE_ACTION_TO_STATUS: Record<string, string> = {
  submit: 'submitted',
  approve: 'approved',
  reject: 'rejected',
  pay: 'paid',
  cancel: 'cancelled',
  close: 'closed',
};

/**
 * Statuses where the expense amount counts toward the actual_cost KPI.
 * Once approved, the spend is considered committed — paid and closed
 * are subsequent settlement states that don't change the committed amount.
 */
export const EXPENSE_APPROVED_PLUS_STATUSES = ['approved', 'paid', 'closed'];
