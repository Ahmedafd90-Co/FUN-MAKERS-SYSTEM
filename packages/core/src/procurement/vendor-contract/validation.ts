/**
 * VendorContract validation helpers.
 *
 * Phase 5, Task 5.1 — Module 3 Procurement Engine.
 */

/**
 * Generates the next sequential contract number.
 * Pattern: VC-0001, VC-0002, etc.
 */
export function nextContractNumber(lastNumber: string | null): string {
  if (!lastNumber) return 'VC-0001';
  const match = lastNumber.match(/^VC-(\d+)$/);
  if (!match || !match[1]) return 'VC-0001';
  const next = parseInt(match[1], 10) + 1;
  return `VC-${String(next).padStart(4, '0')}`;
}

/**
 * Statuses that allow editing the vendor contract record.
 */
export const EDITABLE_STATUSES = ['draft', 'returned'];
