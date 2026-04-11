/**
 * ProcurementCategory validation helpers.
 *
 * Phase 4, Task 4.1 — Module 3 Procurement Engine.
 */

const LEVEL_ORDER = ['category', 'subcategory', 'spend_type'] as const;
type CategoryLevel = (typeof LEVEL_ORDER)[number];

/**
 * Given a parent's level, returns the expected child level.
 * - category   -> subcategory
 * - subcategory -> spend_type
 * - spend_type  -> (invalid — cannot have children)
 */
export function deriveChildLevel(parentLevel: string): CategoryLevel {
  if (parentLevel === 'category') return 'subcategory';
  if (parentLevel === 'subcategory') return 'spend_type';
  throw new Error(`Cannot create a child under level '${parentLevel}'. spend_type is a leaf level.`);
}

/**
 * Validates that a category level string is one of the known enum values.
 */
export function validateCategoryLevel(level: string): level is CategoryLevel {
  return LEVEL_ORDER.includes(level as CategoryLevel);
}

/**
 * Returns 'category' as the default top-level when no parent is provided.
 */
export function defaultTopLevel(): CategoryLevel {
  return 'category';
}
