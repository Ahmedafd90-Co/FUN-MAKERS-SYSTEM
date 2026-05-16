/**
 * PIC-38 — defense-in-depth guardrail for destructive @fmksa/web tests.
 *
 * Mirrors packages/db/tests/helpers/assert-test-db.ts (PIC-37) and
 * packages/core/tests/helpers/assert-test-db.ts (PIC-38). Primary defense is
 * the vitest setup file (apps/web/tests/setup-test-db.ts) which re-routes
 * DATABASE_URL before any test imports prisma. This is the secondary defense
 * — call from beforeAll / beforeEach in any test with destructive DB writes.
 */

export function isTestDatabaseUrl(rawUrl: string): boolean {
  try {
    const u = new URL(rawUrl);
    const dbName = decodeURIComponent(u.pathname.replace(/^\/+/, ''));
    return dbName.endsWith('_test');
  } catch {
    return false;
  }
}

function redactPassword(url: string): string {
  return url.replace(/:[^:@/]+@/, ':***@');
}

export function assertTestDb(): void {
  const url = process.env.DATABASE_URL ?? '';
  if (!isTestDatabaseUrl(url)) {
    const display = url ? redactPassword(url) : '(unset)';
    throw new Error(
      `PIC-38 guardrail: refusing to run destructive @fmksa/web test against ` +
        `${display}. Expected DATABASE_URL to point at a *_test database ` +
        `(database name ending in _test). ` +
        `Check vitest setup wiring at apps/web/tests/setup-test-db.ts.`,
    );
  }
}
