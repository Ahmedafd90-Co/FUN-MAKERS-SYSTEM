/**
 * tRPC request context — resolved once per request.
 *
 * When a session exists (JWT decoded by Auth.js) the user is loaded from
 * the DB with effective roles and permissions. Public pages skip the DB
 * lookup entirely — `user` is null.
 */
import { prisma } from '@fmksa/db';
import { authService } from '@fmksa/core';
import { auth } from '@/lib/auth';
import type { AuthUser } from '@fmksa/core';
import type { Session } from 'next-auth';

export type Context = {
  db: typeof prisma;
  user: AuthUser | null;
  session: Session | null;
};

/**
 * Create the tRPC context for each request.
 *
 * Called by the fetch adapter handler in the App Router API route.
 */
export async function createTRPCContext(): Promise<Context> {
  // Decode the JWT via Auth.js — returns null if no valid session
  const session = (await auth()) as Session | null;

  let user: AuthUser | null = null;

  // Only hit the DB when we have a session (keeps public pages fast)
  if (session?.user?.id) {
    user = await authService.getUser(session.user.id);
  }

  return {
    db: prisma,
    user,
    session,
  };
}
