import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    testTimeout: 30_000,
    hookTimeout: 30_000,
    include: ['tests/**/*.test.ts'],
    // setupFiles run as imports before any test file evaluates — required to re-route
    // DATABASE_URL before `@fmksa/db`'s prisma singleton is constructed. PIC-38.
    setupFiles: ['tests/setup-test-db.ts'],
    globalSetup: ['tests/global-setup.ts'],
    fileParallelism: false, // Tests share DB state (workflow templates); run sequentially
  },
});
