/**
 * Quotation status transitions.
 *
 * Phase 5, Task 5.4 — Module 3 Procurement Engine.
 */

export const QUOTATION_TRANSITIONS: Record<string, string[]> = {
  received: ['under_review', 'expired'],
  under_review: ['shortlisted', 'rejected', 'expired'],
  // 'awarded' removed — quotation award happens only through RFQ award (award integrity invariant)
  shortlisted: ['rejected', 'expired'],
};

export const QUOTATION_TERMINAL_STATUSES = ['awarded', 'rejected', 'expired'];

export const ACTION_TO_STATUS: Record<string, string> = {
  review: 'under_review',
  shortlist: 'shortlisted',
  // 'award' removed — quotation award happens only through RFQ award (award integrity invariant)
  reject: 'rejected',
  expire: 'expired',
};
