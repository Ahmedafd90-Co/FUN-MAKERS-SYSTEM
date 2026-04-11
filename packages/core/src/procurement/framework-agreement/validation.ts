/**
 * FrameworkAgreement validation helpers.
 *
 * Phase 5, Task 5.2 — Module 3 Procurement Engine.
 */

/**
 * Generates the next sequential agreement number.
 * Pattern: FA-0001, FA-0002, etc.
 */
export function nextAgreementNumber(lastNumber: string | null): string {
  if (!lastNumber) return 'FA-0001';
  const match = lastNumber.match(/^FA-(\d+)$/);
  if (!match || !match[1]) return 'FA-0001';
  const next = parseInt(match[1], 10) + 1;
  return `FA-${String(next).padStart(4, '0')}`;
}

/**
 * Statuses that allow editing the framework agreement record.
 */
export const EDITABLE_STATUSES = ['draft', 'returned'];
