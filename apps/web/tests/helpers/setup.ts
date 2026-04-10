/**
 * Vitest global setup — mocks Next.js-specific modules that cannot be loaded
 * outside the Next.js runtime.
 *
 * This must run before any test file that transitively imports `@/lib/auth`
 * (e.g. via appRouter → authRouter).
 */
import { vi } from 'vitest';

// Mock @/lib/auth (next-auth wrappers) — these functions require the Next.js
// server runtime. In tests we bypass Auth.js and construct contexts directly.
vi.mock('@/lib/auth', () => ({
  auth: vi.fn().mockResolvedValue(null),
  signIn: vi.fn().mockResolvedValue(undefined),
  signOut: vi.fn().mockResolvedValue(undefined),
  handlers: {
    GET: vi.fn(),
    POST: vi.fn(),
  },
}));
