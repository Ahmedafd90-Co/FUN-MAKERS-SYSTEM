/**
 * ItemCatalog validation helpers.
 *
 * Phase 4, Task 4.2 — Module 3 Procurement Engine.
 */

/**
 * Generates the next sequential item code for the entity.
 * Pattern: IC-0001, IC-0002, etc.
 */
export function nextItemCode(lastCode: string | null): string {
  if (!lastCode) return 'IC-0001';
  const match = lastCode.match(/^IC-(\d+)$/);
  if (!match || !match[1]) return 'IC-0001';
  const next = parseInt(match[1], 10) + 1;
  return `IC-${String(next).padStart(4, '0')}`;
}
