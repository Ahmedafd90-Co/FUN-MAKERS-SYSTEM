/**
 * Vendor validation helpers.
 *
 * Phase 4, Task 4.3 — Module 3 Procurement Engine.
 */

/**
 * Generates the next sequential vendor code for the entity.
 * Pattern: V-0001, V-0002, etc.
 */
export function nextVendorCode(lastCode: string | null): string {
  if (!lastCode) return 'V-0001';
  const match = lastCode.match(/^V-(\d+)$/);
  if (!match || !match[1]) return 'V-0001';
  const next = parseInt(match[1], 10) + 1;
  return `V-${String(next).padStart(4, '0')}`;
}

/**
 * Statuses that allow editing the vendor record.
 */
export const EDITABLE_STATUSES = ['draft', 'active'];
