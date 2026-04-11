/**
 * RFQ status transitions.
 *
 * Phase 5, Task 5.3 — Module 3 Procurement Engine.
 */

export const RFQ_TRANSITIONS: Record<string, string[]> = {
  draft: ['under_review'],
  under_review: ['approved_internal', 'returned', 'rejected'],
  returned: ['under_review'],
  approved_internal: ['issued'],
  issued: ['responses_received', 'cancelled'],
  responses_received: ['evaluation'],
  evaluation: ['awarded', 'cancelled'],
  awarded: ['closed'],
};

export const RFQ_TERMINAL_STATUSES = ['rejected', 'closed', 'cancelled'];

export const ACTION_TO_STATUS: Record<string, string> = {
  submit: 'under_review',
  approve: 'approved_internal',
  reject: 'rejected',
  return: 'returned',
  issue: 'issued',
  receive_responses: 'responses_received',
  evaluate: 'evaluation',
  award: 'awarded',
  cancel: 'cancelled',
  close: 'closed',
};
