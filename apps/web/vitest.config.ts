import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname),
    },
  },
  test: {
    globals: true,
    environment: 'node',
    testTimeout: 30_000,
    hookTimeout: 30_000,
    // PIC-38: setup-test-db.ts must come FIRST — it routes DATABASE_URL to
    // fmksa_test before any test file imports prisma. setup.ts mocks Next.js
    // auth and is independent of DB routing.
    setupFiles: ['./tests/setup-test-db.ts', './tests/helpers/setup.ts'],
    include: ['server/**/*.test.ts', 'tests/**/*.test.ts'],
  },
});
