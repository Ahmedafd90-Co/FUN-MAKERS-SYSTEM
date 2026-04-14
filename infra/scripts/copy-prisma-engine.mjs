#!/usr/bin/env node
/**
 * copy-prisma-engine.mjs
 *
 * Copies the Prisma query-engine binary from the pnpm store into
 * apps/web/.prisma/client/ so Next.js can find it at runtime.
 *
 * Why this is needed:
 *   pnpm stores the generated Prisma client (including the native engine
 *   binary) deep inside node_modules/.pnpm/. When Next.js bundles
 *   server-side code in a monorepo, webpack rewrites __dirname and the
 *   engine path resolution breaks. Placing a copy at apps/web/.prisma/client/
 *   puts it on Prisma's built-in search path.
 *
 * Called by: root package.json "postinstall" after `prisma generate`.
 * Idempotent — safe to run multiple times.
 */

import { readdirSync, cpSync, mkdirSync, existsSync } from 'node:fs';
import { join, basename } from 'node:path';

const TARGET_DIR = 'apps/web/.prisma/client';
const ENGINE_PREFIX = 'libquery_engine-';

// Walk the pnpm store to find the generated .prisma/client directory.
function findGeneratedDir(base) {
  const pnpmDir = join(base, 'node_modules', '.pnpm');
  if (!existsSync(pnpmDir)) return null;

  for (const entry of readdirSync(pnpmDir)) {
    if (!entry.startsWith('@prisma+client@')) continue;
    const candidate = join(pnpmDir, entry, 'node_modules', '.prisma', 'client');
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

const root = process.cwd();
const sourceDir = findGeneratedDir(root);

if (!sourceDir) {
  console.log('[copy-prisma-engine] No generated Prisma client found — skipping.');
  process.exit(0);
}

mkdirSync(join(root, TARGET_DIR), { recursive: true });

let copied = 0;
for (const file of readdirSync(sourceDir)) {
  if (file.startsWith(ENGINE_PREFIX) || file === 'schema.prisma') {
    cpSync(join(sourceDir, file), join(root, TARGET_DIR, file));
    copied++;
  }
}

if (copied > 0) {
  console.log(`[copy-prisma-engine] Copied ${copied} file(s) to ${TARGET_DIR}`);
} else {
  console.log('[copy-prisma-engine] No engine binary found in generated client.');
}
