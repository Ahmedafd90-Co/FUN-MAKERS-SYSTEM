export const TAX_INVOICE_TRANSITIONS: Record<string, string[]> = {
  draft: ['under_review'],
  under_review: ['approved_internal', 'returned'],
  returned: ['under_review'],
  approved_internal: ['issued'],
  issued: ['submitted', 'overdue', 'cancelled', 'superseded'],
  submitted: ['partially_collected', 'collected', 'overdue', 'cancelled'],
  overdue: ['partially_collected', 'collected', 'cancelled'],
  partially_collected: ['collected', 'overdue'],
};

export const TAX_INVOICE_TERMINAL_STATUSES = ['collected', 'cancelled', 'superseded', 'closed'];
