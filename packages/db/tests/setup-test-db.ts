/**
 * PIC-37 — vitest setup: route every @fmksa/db test at fmksa_test, never fmksa_dev.
 *
 * Why this exists: several tests in this package destructively TRUNCATE tables
 * or run seed routines (idempotency, demo-project-integrity, seed-coverage,
 * the middleware tests via cleanTestData). Without this guard they connect to
 * whatever DATABASE_URL points at — which in a developer's local environment
 * is fmksa_dev (the demo database). Running `pnpm -w test` then silently wipes
 * the demo data every time. This file is the primary defense; per-test
 * `assertTestDb()` calls are the secondary defense.
 *
 * Order of operations (must run before any test file imports `prisma`):
 *   1. Read packages/db/.env so DATABASE_URL_TEST is available.
 *   2. Verify DATABASE_URL_TEST is set and points at a *_test database.
 *   3. Override process.env.DATABASE_URL with DATABASE_URL_TEST. PrismaClient
 *      reads DATABASE_URL at construction time, so this re-routes the shared
 *      singleton (src/client.ts) and any test-file `new PrismaClient()`.
 *
 * If anything is wrong, throw — vitest aborts the worker. Fail loud, never
 * silently fall back to fmksa_dev. That's the whole point of this file.
 */

import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { isTestDatabaseUrl } from './helpers/assert-test-db';

// ESM-safe __dirname. packages/db/package.json declares "type": "module";
// __dirname is not a built-in in native ESM, so derive it from import.meta.url.
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
    // Strip surrounding quotes if present
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

// 1. Try process.env first; fall back to packages/db/.env.
let testUrl = process.env.DATABASE_URL_TEST;

if (!testUrl) {
  const envPath = resolve(__dirname, '..', '.env');
  const parsed = readEnvFile(envPath);
  testUrl = parsed.DATABASE_URL_TEST;
  // Don't pollute the rest of the env beyond what we need.
}

// 2. Verify presence and shape.
if (!testUrl) {
  throw new Error(
    'PIC-37 guardrail: DATABASE_URL_TEST is not set. ' +
      'Destructive seed tests in @fmksa/db cannot run without an explicit test database URL. ' +
      'Set DATABASE_URL_TEST in packages/db/.env (e.g. ' +
      'postgresql://fmksa:fmksa@localhost:5432/fmksa_test?schema=public) ' +
      'or export it in your shell before running tests.',
  );
}

if (!isTestDatabaseUrl(testUrl)) {
  throw new Error(
    `PIC-37 guardrail: DATABASE_URL_TEST does not point at a *_test database. ` +
      `Got: ${redactPassword(testUrl)}. ` +
      `Refusing to run destructive seed tests against a non-test database. ` +
      `Expected the database name (URL pathname) to end with '_test' (e.g. fmksa_test).`,
  );
}

// 3. Re-route. PrismaClient reads DATABASE_URL at construction time.
process.env.DATABASE_URL = testUrl;

console.log(
  `[PIC-37] @fmksa/db tests routed to test database: ${redactPassword(testUrl)}`,
);
