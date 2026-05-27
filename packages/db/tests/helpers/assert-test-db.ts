/**
 * PIC-37 — defense-in-depth guardrail for destructive @fmksa/db tests.
 *
 * The vitest setup file (tests/setup-test-db.ts) is the primary line of defense:
 * it re-routes DATABASE_URL to DATABASE_URL_TEST before any test file imports
 * `prisma`. This helper is the secondary defense — call it from `beforeAll` in
 * any test that TRUNCATEs, seeds, or otherwise destructively writes. If someone
 * skips the setup file (e.g. running a single test via `vitest run --config`
 * with a different config), the inline assertion still aborts the run.
 *
 * Accepted DB-name shapes (PIC-76 F3 extends PIC-37):
 * - Ends with `_test` (legacy: `fmksa_test`)
 * - Matches `_test_<suffix>` where suffix is alphanumeric (F3: per-package
 *   test DBs like `fmksa_test_db`, `fmksa_test_core`)
 *
 * Rejected: anything else, including `_dev` databases. The check parses the
 * URL and inspects pathname's last segment, so `_test` appearing in username,
 * host, or query string does not falsely pass.
 */

/**
 * Returns true iff `rawUrl` parses as a URL whose pathname's last segment
 * (the database name in postgres connection strings) is a test DB.
 * Returns false on any parse error or any non-test database.
 */
export function isTestDatabaseUrl(rawUrl: string): boolean {
  try {
    const u = new URL(rawUrl);
    const dbName = decodeURIComponent(u.pathname.replace(/^\/+/, ''));
    // Legacy shape (`*_test`) OR PIC-76 F3 per-package shape (`*_test_<pkg>`)
    return dbName.endsWith('_test') || /_test_[a-z0-9]+$/.test(dbName);
  } catch {
    return false;
  }
}

/** Mask the user:pass segment of a connection string so error messages don't leak credentials. */
function redactPassword(url: string): string {
  return url.replace(/:[^:@/]+@/, ':***@');
}

export function assertTestDb(): void {
  const url = process.env.DATABASE_URL ?? '';
  if (!isTestDatabaseUrl(url)) {
    const display = url ? redactPassword(url) : '(unset)';
    throw new Error(
      `PIC-37 guardrail: refusing to run destructive @fmksa/db test against ` +
        `${display}. Expected DATABASE_URL to point at a *_test database ` +
        `(database name ending in _test). ` +
        `Check vitest setup wiring at packages/db/tests/setup-test-db.ts.`,
    );
  }
}
