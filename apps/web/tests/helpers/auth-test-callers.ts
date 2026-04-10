/**
 * Test helpers — tRPC callers with specific auth contexts.
 *
 * These factories build `appRouter.createCaller(ctx)` instances that bypass
 * Auth.js entirely. The context shape mirrors what `createTRPCContext()`
 * produces at runtime (see apps/web/server/context.ts).
 *
 * Task 1.3.17
 */

import { prisma } from '@fmksa/db';
import { authService } from '@fmksa/core';
import type { AuthUser } from '@fmksa/core';
import type { Context } from '../../server/context';
import { appRouter } from '../../server/routers/_app';

// ---------------------------------------------------------------------------
// Context builder
// ---------------------------------------------------------------------------

/** Build a minimal tRPC context for testing. */
export function makeCtx(user: AuthUser | null): Context {
  return {
    db: prisma,
    user,
    session: user
      ? { user: { id: user.id, email: user.email, name: user.name } } as Context['session']
      : null,
  };
}

// ---------------------------------------------------------------------------
// Caller factories
// ---------------------------------------------------------------------------

/**
 * Creates a tRPC caller with no user in context (null session).
 * All protected procedures should reject this caller with UNAUTHORIZED.
 */
export async function unauthenticatedCaller() {
  return appRouter.createCaller(makeCtx(null));
}

/**
 * Creates a caller for a specific user ID (loaded from DB with roles/permissions).
 */
export async function authenticatedCaller(userId: string) {
  const user = await authService.getUser(userId);
  if (!user) {
    throw new Error(`User ${userId} not found in DB`);
  }
  return appRouter.createCaller(makeCtx(user));
}

/**
 * Finds the seeded master admin and creates a fully authenticated caller.
 */
export async function masterAdminCaller() {
  const admin = await prisma.user.findUniqueOrThrow({
    where: { email: 'ahmedafd90@gmail.com' },
  });
  return authenticatedCaller(admin.id);
}

// ---------------------------------------------------------------------------
// AuthUser loader (re-usable in test setup)
// ---------------------------------------------------------------------------

/**
 * Load a user by ID with their currently-effective roles and permissions.
 * Returns the `AuthUser` shape that tRPC context expects.
 */
export async function loadAuthUser(userId: string): Promise<AuthUser> {
  const user = await authService.getUser(userId);
  if (!user) {
    throw new Error(`User ${userId} not found in DB`);
  }
  return user;
}
