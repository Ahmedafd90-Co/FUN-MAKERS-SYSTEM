/**
 * Vendor status transitions — direct status change (no workflow).
 *
 * Phase 4, Task 4.3 — Module 3 Procurement Engine.
 */

export const VENDOR_TRANSITIONS: Record<string, string[]> = {
  draft: ['active'],
  active: ['suspended', 'archived'],
  suspended: ['active', 'blacklisted', 'archived'],
};

export const VENDOR_TERMINAL_STATUSES = ['blacklisted', 'archived'];

export const ACTION_TO_STATUS: Record<string, string> = {
  activate: 'active',
  suspend: 'suspended',
  blacklist: 'blacklisted',
  archive: 'archived',
};
