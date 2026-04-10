/**
 * tRPC v11 base configuration for the Fun Makers KSA platform.
 *
 * Exports:
 *  - `router`              — tRPC router factory
 *  - `publicProcedure`     — no auth required
 *  - `protectedProcedure`  — UNAUTHORIZED if no user in context
 *  - `adminProcedure`      — FORBIDDEN if user lacks system.admin permission
 *  - `projectProcedure`    — project-scoped: assignment check + ctx.projectId
 *  - `createCallerFactory` — for server-side calling
 */
import { initTRPC, TRPCError } from '@trpc/server';
import superjson from 'superjson';
import type { Context } from './context';
import {
  extractProjectId,
  verifyProjectAccess,
} from './middleware/project-scope';

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

/**
 * Middleware that enforces project-scope isolation.
 *
 * Reads `projectId` from raw input, verifies the caller's project
 * assignment (or cross_project.read), writes an audit log on denial,
 * and injects `ctx.projectId` for downstream resolvers.
 */
const enforceProjectScopeMiddleware = t.middleware(
  async ({ ctx, next, getRawInput, input, path }) => {
    // Auth is already enforced by protectedProcedure upstream, but we
    // defensively check again for safety.
    if (!ctx.user) {
      throw new TRPCError({
        code: 'UNAUTHORIZED',
        message: 'You must be signed in to perform this action.',
      });
    }

    // Extract projectId from parsed input or raw input
    let projectId = extractProjectId(input);
    if (!projectId) {
      const rawInput = await getRawInput();
      projectId = extractProjectId(rawInput);
    }

    if (!projectId) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'projectId is required for this operation.',
      });
    }

    // Verify assignment / cross-project access (throws on denial)
    await verifyProjectAccess({
      userId: ctx.user.id,
      projectId,
      path,
    });

    // Pass projectId into context for downstream resolvers
    return next({
      ctx: {
        ...ctx,
        user: ctx.user,
        projectId,
      },
    });
  },
);

/**
 * Project-scoped procedure. Every project-scoped API endpoint uses this.
 * Enforces: user must be assigned to the project OR have cross_project.read.
 * Adds ctx.projectId for downstream use.
 */
export const projectProcedure = protectedProcedure.use(
  enforceProjectScopeMiddleware,
);
