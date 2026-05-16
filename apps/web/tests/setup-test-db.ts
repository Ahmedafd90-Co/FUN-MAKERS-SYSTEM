/**
 * PIC-38 — vitest setup: route every @fmksa/web test at fmksa_test, never fmksa_dev.
 *
 * Mirrors the PIC-37 pattern (packages/db/tests/setup-test-db.ts) and the
 * packages/core/tests/setup-test-db.ts companion. Several apps/web tests
 * destructively delete users / roles / projects / entities (permission-deny,
 * project-isolation, auth-flow, dashboard, user-search, procurement-permission-
 * deny). Without this guard those tests connect to whatever DATABASE_URL is set
 * to — usually fmksa_dev in a developer's environment — and corrupt demo data.
 *
 * Order of operations: must run before any test file imports `prisma`.
 *   1. Read packages/db/.env so DATABASE_URL_TEST is available.
 *   2. Verify DATABASE_URL_TEST is set and points at a *_test database.
 *   3. Override process.env.DATABASE_URL with DATABASE_URL_TEST.
 *
 * Fail loud: throw and abort the worker if anything's off. Never silently fall
 * back to fmksa_dev.
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
  // apps/web/tests/setup-test-db.ts → packages/db/.env
  const envPath = resolve(__dirname, '..', '..', '..', 'packages', 'db', '.env');
  const parsed = readEnvFile(envPath);
  testUrl = parsed.DATABASE_URL_TEST;
}

if (!testUrl) {
  throw new Error(
    'PIC-38 guardrail: DATABASE_URL_TEST is not set. ' +
      'Destructive tests in @fmksa/web cannot run without an explicit test database URL. ' +
      'Set DATABASE_URL_TEST in packages/db/.env (e.g. ' +
      'postgresql://fmksa:fmksa@localhost:5432/fmksa_test?schema=public) ' +
      'or export it in your shell before running tests.',
  );
}

if (!isTestDatabaseUrl(testUrl)) {
  throw new Error(
    `PIC-38 guardrail: DATABASE_URL_TEST does not point at a *_test database. ` +
      `Got: ${redactPassword(testUrl)}. ` +
      `Refusing to run destructive @fmksa/web tests against a non-test database.`,
  );
}

process.env.DATABASE_URL = testUrl;

console.log(
  `[PIC-38] @fmksa/web tests routed to test database: ${redactPassword(testUrl)}`,
);
