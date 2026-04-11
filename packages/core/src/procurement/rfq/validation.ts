/**
 * RFQ validation helpers.
 *
 * Phase 5, Task 5.3 — Module 3 Procurement Engine.
 */

/**
 * Generates the next sequential RFQ number.
 * Pattern: RFQ-0001, RFQ-0002, etc.
 */
export function nextRfqNumber(lastNumber: string | null): string {
  if (!lastNumber) return 'RFQ-0001';
  const match = lastNumber.match(/^RFQ-(\d+)$/);
  if (!match || !match[1]) return 'RFQ-0001';
  const next = parseInt(match[1], 10) + 1;
  return `RFQ-${String(next).padStart(4, '0')}`;
}

/**
 * Generates the next sequential reference number within project scope.
 * Pattern: RFQ-0001, RFQ-0002, etc.
 */
export function nextRfqReferenceNumber(lastRef: string | null): string {
  if (!lastRef) return 'RFQ-0001';
  const match = lastRef.match(/^RFQ-(\d+)$/);
  if (!match || !match[1]) return 'RFQ-0001';
  const next = parseInt(match[1], 10) + 1;
  return `RFQ-${String(next).padStart(4, '0')}`;
}

/**
 * Statuses that allow editing the RFQ record.
 */
export const EDITABLE_STATUSES = ['draft', 'returned'];
