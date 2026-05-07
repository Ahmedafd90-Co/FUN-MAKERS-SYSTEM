/**
 * PIC-37 — apply Prisma migrations to fmksa_test.
 *
 * Idempotent: prisma migrate deploy is a no-op if migrations are already current.
 * Reads DATABASE_URL_TEST from packages/db/.env and uses it as DATABASE_URL for
 * the migrate command. Refuses to run if the URL doesn't contain `_test`.
 *
 * Usage:
 *   pnpm --filter @fmksa/db db:migrate:test
 *
 * Run this once when cloning the repo, or whenever new migrations land.
 */

import { execSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const TEST_URL_PATTERN = /_test(\b|\?|$)/;

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
  const envPath = resolve(__dirname, '..', '.env');
  testUrl = readEnvFile(envPath).DATABASE_URL_TEST;
}

if (!testUrl) {
  console.error(
    'ERROR: DATABASE_URL_TEST is not set. ' +
      'Add it to packages/db/.env (e.g. ' +
      'postgresql://fmksa:fmksa@localhost:5432/fmksa_test?schema=public).',
  );
  process.exit(1);
}

if (!TEST_URL_PATTERN.test(testUrl)) {
  console.error(
    `ERROR: DATABASE_URL_TEST does not point at a *_test database. ` +
      `Got: ${redactPassword(testUrl)}. Refusing to migrate.`,
  );
  process.exit(1);
}

console.log(`Applying migrations to ${redactPassword(testUrl)}...`);

execSync('prisma migrate deploy', {
  stdio: 'inherit',
  env: { ...process.env, DATABASE_URL: testUrl },
});
