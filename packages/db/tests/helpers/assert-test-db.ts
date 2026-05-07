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
 * Fail-loud by design: throws on any URL that doesn't contain `_test`.
 */

const TEST_URL_PATTERN = /_test(\b|\?|$)/;

export function assertTestDb(): void {
  const url = process.env.DATABASE_URL ?? '';
  if (!TEST_URL_PATTERN.test(url)) {
    const display = url || '(unset)';
    throw new Error(
      `PIC-37 guardrail: refusing to run destructive @fmksa/db test against ` +
        `${display}. Expected DATABASE_URL to point at a *_test database. ` +
        `Check vitest setup wiring at packages/db/tests/setup-test-db.ts.`,
    );
  }
}
