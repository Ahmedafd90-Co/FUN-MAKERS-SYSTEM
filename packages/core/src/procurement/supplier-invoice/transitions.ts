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
