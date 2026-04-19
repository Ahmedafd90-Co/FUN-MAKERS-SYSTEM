/**
 * Permission Catalog Guardrail Test
 *
 * Scans every tRPC router file for permission string literals and validates
 * that each one exists in the unified permission catalog.
 *
 * WHY: The `ipa.list` bug silently broke 6 modules because the router checked
 * a permission code that was never seeded. This test prevents that entire
 * class of bugs by catching mismatches at CI time.
 *
 * HOW: Reads router source files as text, extracts all strings passed to
 * `permissions.includes('xxx')` and `entityPermissions.includes('xxx')`,
 * then asserts each exists in PERMISSION_CATALOG.
 *
 * Created 2026-04-12 — System Integrity Pass.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join, relative } from 'path';
import { PERMISSION_CATALOG } from '../../src/seed/permission-catalog';
import { PERMISSIONS } from '../../src/seed/permissions';
import { COMMERCIAL_PERMISSIONS } from '../../src/seed/commercial-permissions';
import { PROCUREMENT_PERMISSIONS } from '../../src/seed/procurement-permissions';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Recursively collect all .ts files under a directory */
function collectTsFiles(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      collectTsFiles(full, acc);
    } else if (entry.endsWith('.ts') || entry.endsWith('.tsx')) {
      acc.push(full);
    }
  }
  return acc;
}

/**
 * Extract permission codes from source text.
 * Matches patterns like:
 *   ctx.user.permissions.includes('ipa.view')
 *   ctx.entityPermissions.includes('rfq.edit')
 *   permissions.includes('system.admin')
 */
function extractPermissionChecks(source: string, filePath: string): { code: string; line: number; file: string }[] {
  const results: { code: string; line: number; file: string }[] = [];
  const regex = /permissions\.includes\(\s*['"]([^'"]+)['"]\s*\)/g;
  const lines = source.split('\n');

  for (let i = 0; i < lines.length; i++) {
    let match: RegExpExecArray | null;
    // Reset regex for each line
    const lineRegex = /permissions\.includes\(\s*['"]([^'"]+)['"]\s*\)/g;
    while ((match = lineRegex.exec(lines[i]!)) !== null) {
      results.push({ code: match[1]!, line: i + 1, file: filePath });
    }
  }
  return results;
}

// ---------------------------------------------------------------------------
// Locate router files
// ---------------------------------------------------------------------------

// Relative from packages/db → apps/web/server/routers
const ROUTERS_DIR = join(__dirname, '..', '..', '..', '..', 'apps', 'web', 'server', 'routers');

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Permission Catalog Guardrail', () => {
  it('should contain at least 100 permission codes (sanity check)', () => {
    // 47 base + 62 commercial (6×10 + 2) + 80+ procurement = 189+
    expect(PERMISSION_CATALOG.size).toBeGreaterThanOrEqual(100);
  });

  it('should include previously-broken codes that are now fixed', () => {
    // These were the original BUG-1 codes that didn't exist
    expect(PERMISSION_CATALOG.has('ipa.list')).toBe(false);
    expect(PERMISSION_CATALOG.has('ipc.list')).toBe(false);
    expect(PERMISSION_CATALOG.has('variation.list')).toBe(false);

    // Retired: *.transition was replaced by granular mapping in apps/web/server/routers/commercial/transition-permissions.ts.
    expect(PERMISSION_CATALOG.has('ipa.transition')).toBe(false);
    expect(PERMISSION_CATALOG.has('ipc.transition')).toBe(false);
    expect(PERMISSION_CATALOG.has('variation.transition')).toBe(false);

    // These DO exist in the catalog
    expect(PERMISSION_CATALOG.has('ipa.view')).toBe(true);
    expect(PERMISSION_CATALOG.has('ipc.view')).toBe(true);
    expect(PERMISSION_CATALOG.has('variation.view')).toBe(true);
  });

  it('should include the newly-added commercial actions', () => {
    // Added during System Integrity Pass to match existing router checks
    expect(PERMISSION_CATALOG.has('ipa.delete')).toBe(true);
    expect(PERMISSION_CATALOG.has('ipc.delete')).toBe(true);
    expect(PERMISSION_CATALOG.has('variation.delete')).toBe(true);
  });

  it('every permission checked in tRPC routers must exist in the catalog', () => {
    const routerFiles = collectTsFiles(ROUTERS_DIR);
    expect(routerFiles.length).toBeGreaterThan(0);

    const violations: string[] = [];

    for (const filePath of routerFiles) {
      const source = readFileSync(filePath, 'utf-8');
      const checks = extractPermissionChecks(source, filePath);

      for (const { code, line, file } of checks) {
        if (!PERMISSION_CATALOG.has(code)) {
          const rel = relative(join(__dirname, '..', '..', '..', '..'), file);
          violations.push(`${rel}:${line} — checks "${code}" which is NOT in the permission catalog`);
        }
      }
    }

    if (violations.length > 0) {
      const msg = [
        `Found ${violations.length} permission code(s) used in routers that do not exist in the catalog:`,
        '',
        ...violations,
        '',
        'Fix: add the missing code to the appropriate seed file',
        '  (permissions.ts, commercial-permissions.ts, or procurement-permissions.ts)',
        '  then re-run this test.',
      ].join('\n');
      expect.fail(msg);
    }
  });

  it('no duplicate codes across seed files', () => {
    const all = [
      ...PERMISSIONS.map(p => p.code),
      ...COMMERCIAL_PERMISSIONS.map(p => p.code),
      ...PROCUREMENT_PERMISSIONS.map(p => p.code),
    ];

    const seen = new Set<string>();
    const dupes: string[] = [];
    for (const code of all) {
      if (seen.has(code)) dupes.push(code);
      seen.add(code);
    }

    expect(dupes).toEqual([]);
  });
});
