/**
 * Version tags for the import pipeline — freshness guard.
 *
 * Bump any of these when the semantics change. The commit path refuses to
 * promote a batch whose validation was produced under an older version,
 * because stale validation may mask new errors or miss new checks.
 *
 * Rule of thumb:
 *   - Bump PARSER_VERSION when sheet column handling changes (new columns,
 *     renamed columns, new cell coercion).
 *   - Bump VALIDATOR_SCHEMA_VERSION when a new validation rule is added,
 *     an old one is relaxed, or conflict detection changes.
 */

import type { ImportType } from '@fmksa/db';

export const PARSER_VERSIONS: Record<ImportType, string> = {
  budget_baseline: '2026.04.15.01',
  ipa_history: '2026.04.15.01',
};

export const VALIDATOR_SCHEMA_VERSIONS: Record<ImportType, string> = {
  budget_baseline: '2026.04.15.01',
  ipa_history: '2026.04.15.01',
};
