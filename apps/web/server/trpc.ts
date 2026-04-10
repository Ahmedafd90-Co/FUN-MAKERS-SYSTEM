/**
 * tRPC v11 base configuration for the Fun Makers KSA platform.
 *
 * Exports:
 *  - `router`              — tRPC router factory
 *  - `publicProcedure`     — no auth required
 *  - `protectedProcedure`  — UNAUTHORIZED if no user in context
 *  - `adminProcedure`      — FORBIDDEN if user lacks system.admin permission
 *  - `createCallerFactory` — for server-side calling
 */
import { initTRPC, TRPCError } from '@trpc/server';
import superjson from 'superjson';
import type { Context } from './context';

const t = initTRPC.context<Context>().create({
  transformer: superjson,
  errorFormatter({ shape }) {
    return shape;
  },
});

// ---------------------------------------------------------------------------
// Router + middleware
// ---------------------------------------------------------------------------

export const router = t.router;
export const createCallerFactory = t.createCallerFactory;

/**
 * Public procedure — no authentication required.
 */
export const publicProcedure = t.procedure;

/**
 * Middleware that enforces authentication.
 */
const enforceAuth = t.middleware(({ ctx, next }) => {
  if (!ctx.user) {
    throw new TRPCError({
      code: 'UNAUTHORIZED',
      message: 'You must be signed in to perform this action.',
    });
  }
  return next({
    ctx: {
      ...ctx,
      user: ctx.user, // narrowed to non-null
    },
  });
});

/**
 * Protected procedure — requires an authenticated user.
 */
export const protectedProcedure = t.procedure.use(enforceAuth);

/**
 * Middleware that enforces system.admin permission.
 */
const enforceAdmin = t.middleware(({ ctx, next }) => {
  if (!ctx.user) {
    throw new TRPCError({
      code: 'UNAUTHORIZED',
      message: 'You must be signed in to perform this action.',
    });
  }
  if (!ctx.user.permissions.includes('system.admin')) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'You do not have admin privileges.',
    });
  }
  return next({
    ctx: {
      ...ctx,
      user: ctx.user,
    },
  });
});

/**
 * Admin procedure — requires system.admin permission.
 */
export const adminProcedure = t.procedure.use(enforceAdmin);
