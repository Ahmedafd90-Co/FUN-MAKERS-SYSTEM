/**
 * Shared helpers for procurement routers — Hardening patch H3.
 *
 * Centralizes error mapping, permission checking, and transition
 * permission resolution to eliminate duplication and ensure
 * router permission checks match seeded permission codes exactly.
 */
import { TRPCError } from '@trpc/server';
import { getActionPermission } from '@fmksa/core';

// ---------------------------------------------------------------------------
// Error mapping
// ---------------------------------------------------------------------------

export function mapError(err: unknown): never {
  if (err instanceof Error) {
    if (err.message.includes('does not belong to the expected'))
      throw new TRPCError({ code: 'NOT_FOUND', message: err.message });
    if (err.message.includes('not found') || err.message.includes('findUniqueOrThrow'))
      throw new TRPCError({ code: 'NOT_FOUND', message: err.message });
    if (err.message.includes('Cannot') || err.message.includes('Invalid') || err.message.includes('Unknown'))
      throw new TRPCError({ code: 'BAD_REQUEST', message: err.message });
  }
  throw err;
}

// ---------------------------------------------------------------------------
// Permission checks
// ---------------------------------------------------------------------------

/**
 * Check if the user holds a specific permission OR is a system admin.
 * Used by project-scoped procurement routers for transition authorization.
 */
export function hasPerm(ctx: { user: { permissions: string[] } }, perm: string): boolean {
  return ctx.user.permissions.includes('system.admin') || ctx.user.permissions.includes(perm);
}

/**
 * Check if the user holds a specific entity permission OR is a system admin.
 * Used by entity-scoped procurement routers (vendor, framework-agreement).
 */
export function hasEntityPerm(ctx: { entityPermissions: string[] }, perm: string): boolean {
  return ctx.entityPermissions.includes('system.admin') || ctx.entityPermissions.includes(perm);
}

// ---------------------------------------------------------------------------
// Transition permission resolution — delegates to shared permission map
// ---------------------------------------------------------------------------

/**
 * Resolves the required permission code for a transition action.
 * Single source of truth: packages/core/src/procurement/permission-map.ts
 */
export const getTransitionPermission = getActionPermission;
