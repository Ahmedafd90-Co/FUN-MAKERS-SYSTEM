/**
 * Unified Permission Catalog
 *
 * Single source of truth for every permission code in the system.
 * All seed files feed into this set; all router permission checks
 * MUST reference codes that exist here.
 *
 * Guardrail: packages/db/tests/permission-catalog.test.ts scans every
 * router file and fails if any checked code is missing from this set.
 *
 * Created 2026-04-12 — System Integrity Pass.
 */

import { PERMISSIONS } from './permissions';
import { COMMERCIAL_PERMISSIONS } from './commercial-permissions';
import { PROCUREMENT_PERMISSIONS } from './procurement-permissions';

// ---------------------------------------------------------------------------
// Build the unified set from all module seeds
// ---------------------------------------------------------------------------

export const PERMISSION_CATALOG: ReadonlySet<string> = new Set([
  ...PERMISSIONS.map(p => p.code),
  ...COMMERCIAL_PERMISSIONS.map(p => p.code),
  ...PROCUREMENT_PERMISSIONS.map(p => p.code),
]);

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------

/**
 * Returns true if the code exists in the permission catalog.
 */
export function isValidPermission(code: string): boolean {
  return PERMISSION_CATALOG.has(code);
}

/**
 * Throws if the code does not exist in the permission catalog.
 * Use during development / testing to catch drift immediately.
 */
export function assertValidPermission(code: string): void {
  if (!PERMISSION_CATALOG.has(code)) {
    throw new Error(
      `Unknown permission code: "${code}". ` +
      `This code is not in the permission catalog. ` +
      `Add it to the appropriate seed file (permissions.ts, commercial-permissions.ts, or procurement-permissions.ts) first.`,
    );
  }
}
