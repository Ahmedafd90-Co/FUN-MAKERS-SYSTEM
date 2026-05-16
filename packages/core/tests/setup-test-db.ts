/**
 * PIC-38 — vitest setup: route every @fmksa/core test at fmksa_test, never fmksa_dev.
 *
 * Mirrors the @fmksa/db pattern established by PIC-37 (packages/db/tests/setup-test-db.ts).
 * Without this guard the @fmksa/core test suite — which creates projects, entities,
 * IPAs, variations and TRUNCATEs audit_logs — silently writes to whatever DATABASE_URL
 * resolves to in the developer's shell. On a typical local machine that's fmksa_dev
 * (the demo database). PR-W2A's final report confirmed every `pnpm -w test` run drifted
 * 4 → 12 projects, 4 → 14 entities, 3 → 12 IPAs, 2 → 6 variations on fmksa_dev. This
 * file closes that drift for @fmksa/core.
 *
 * Order of operations (must run before any test file imports `prisma`):
 *   1. Read packages/db/.env so DATABASE_URL_TEST is available.
 *   2. Verify DATABASE_URL_TEST is set and points at a *_test database.
 *   3. Override process.env.DATABASE_URL with DATABASE_URL_TEST. PrismaClient
 *      reads DATABASE_URL at construction time, so this re-routes the shared
 *      singleton (`@fmksa/db`).
 *
 * If anything is wrong, throw — vitest aborts the worker. Fail loud, never
 * silently fall back to fmksa_dev. That's the whole point of this file.
 */

import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { isTestDatabaseUrl } from './helpers/assert-test-db';

const __dirname = dirname(fileURLToPath(import.meta.url));

function readEnvFile(filePath: string): Record<string, string> {
  if (!existsSync(filePath)) return {};
  const out: Record<string, string> = {};
  const text = readFileSync(filePath, 'utf-8');
  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq < 0) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

function redactPassword(url: string): string {
  return url.replace(/:[^:@/]+@/, ':***@');
}

let testUrl = process.env.DATABASE_URL_TEST;

if (!testUrl) {
  // packages/core/tests/setup-test-db.ts → packages/db/.env
  const envPath = resolve(__dirname, '..', '..', 'db', '.env');
  const parsed = readEnvFile(envPath);
  testUrl = parsed.DATABASE_URL_TEST;
}

if (!testUrl) {
  throw new Error(
    'PIC-38 guardrail: DATABASE_URL_TEST is not set. ' +
      'Destructive tests in @fmksa/core cannot run without an explicit test database URL. ' +
      'Set DATABASE_URL_TEST in packages/db/.env (e.g. ' +
      'postgresql://fmksa:fmksa@localhost:5432/fmksa_test?schema=public) ' +
      'or export it in your shell before running tests.',
  );
}

if (!isTestDatabaseUrl(testUrl)) {
  throw new Error(
    `PIC-38 guardrail: DATABASE_URL_TEST does not point at a *_test database. ` +
      `Got: ${redactPassword(testUrl)}. ` +
      `Refusing to run destructive @fmksa/core tests against a non-test database. ` +
      `Expected the database name (URL pathname) to end with '_test' (e.g. fmksa_test).`,
  );
}

process.env.DATABASE_URL = testUrl;

console.log(
  `[PIC-38] @fmksa/core tests routed to test database: ${redactPassword(testUrl)}`,
);
