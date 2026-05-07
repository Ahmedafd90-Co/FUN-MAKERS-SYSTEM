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
 * Fail-loud by design: throws on any URL whose database NAME doesn't end in
 * `_test`. The check parses the URL and inspects pathname's last segment, so
 * `_test` appearing in username, host, or query string does not falsely pass.
 */

/**
 * Returns true iff `rawUrl` parses as a URL whose pathname's last segment
 * (the database name in postgres connection strings) ends with `_test`.
 * Returns false on any parse error or any non-test database.
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

export function assertTestDb(): void {
  const url = process.env.DATABASE_URL ?? '';
  if (!isTestDatabaseUrl(url)) {
    const display = url || '(unset)';
    throw new Error(
      `PIC-37 guardrail: refusing to run destructive @fmksa/db test against ` +
        `${display}. Expected DATABASE_URL to point at a *_test database ` +
        `(database name ending in _test). ` +
        `Check vitest setup wiring at packages/db/tests/setup-test-db.ts.`,
    );
  }
}
