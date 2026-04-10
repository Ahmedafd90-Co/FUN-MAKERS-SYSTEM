import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    testTimeout: 30_000,
    hookTimeout: 30_000,
    include: ['tests/**/*.test.ts'],
    // DB integration tests share a single database — run sequentially
    // to avoid TRUNCATE race conditions between test files.
    fileParallelism: false,
  },
});
