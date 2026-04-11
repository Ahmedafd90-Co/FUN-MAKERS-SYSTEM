/**
 * FrameworkAgreement status transitions.
 *
 * Phase 5, Task 5.2 — Module 3 Procurement Engine.
 */

export const FRAMEWORK_AGREEMENT_TRANSITIONS: Record<string, string[]> = {
  draft: ['under_review'],
  under_review: ['approved_internal', 'returned', 'rejected'],
  returned: ['under_review'],
  approved_internal: ['signed'],
  signed: ['active'],
  active: ['expired', 'terminated', 'superseded'],
};

export const FRAMEWORK_AGREEMENT_TERMINAL_STATUSES = ['rejected', 'expired', 'terminated', 'superseded'];

export const ACTION_TO_STATUS: Record<string, string> = {
  submit: 'under_review',
  approve: 'approved_internal',
  reject: 'rejected',
  return: 'returned',
  sign: 'signed',
  activate: 'active',
  terminate: 'terminated',
  supersede: 'superseded',
  expire: 'expired',
};
