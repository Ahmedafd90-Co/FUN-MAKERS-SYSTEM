/**
 * Purchase Order status transitions.
 *
 * Module 3 Procurement Engine — PO lifecycle.
 */

export const PO_TRANSITIONS: Record<string, string[]> = {
  draft: ['submitted'],
  submitted: ['approved', 'rejected'],
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
  issue: 'issued',
  partial_deliver: 'partially_delivered',
  deliver: 'delivered',
  cancel: 'cancelled',
  close: 'closed',
};

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
