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
    setupFiles: ['./tests/helpers/setup.ts'],
    include: ['server/**/*.test.ts', 'tests/**/*.test.ts'],
  },
});
