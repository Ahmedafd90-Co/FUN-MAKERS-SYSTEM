/**
 * PIC-37 — apply Prisma migrations to fmksa_test.
 *
 * Idempotent: prisma migrate deploy is a no-op if migrations are already current.
 * Reads DATABASE_URL_TEST from packages/db/.env and uses it as DATABASE_URL for
 * the migrate command. Refuses to run if the URL's database name doesn't end
 * with `_test`.
 *
 * Usage:
 *   pnpm --filter @fmksa/db db:migrate:test
 *
 * Run this once when cloning the repo, or whenever new migrations land.
 */

import { execSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// ESM-safe __dirname. packages/db/package.json declares "type": "module".
const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Returns true iff `rawUrl` parses as a URL whose pathname's last segment
 * (the database name) ends with `_test`. Inlined here rather than imported
 * from tests/helpers/ to keep scripts/ free of test-directory dependencies.
 */
function isTestDatabaseUrl(rawUrl: string): boolean {
  try {
    const u = new URL(rawUrl);
    const dbName = decodeURIComponent(u.pathname.replace(/^\/+/, ''));
    return dbName.endsWith('_test');
  } catch {
    return false;
  }
}

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

if (!isTestDatabaseUrl(testUrl)) {
  console.error(
    `ERROR: DATABASE_URL_TEST does not point at a *_test database. ` +
      `Got: ${redactPassword(testUrl)}. ` +
      `Database name must end with '_test'. Refusing to migrate.`,
  );
  process.exit(1);
}

console.log(`Applying migrations to ${redactPassword(testUrl)}...`);

execSync('prisma migrate deploy', {
  stdio: 'inherit',
  env: { ...process.env, DATABASE_URL: testUrl },
});
