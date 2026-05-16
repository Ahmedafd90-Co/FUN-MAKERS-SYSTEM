/**
 * Shared helpers for Layer 1 routers.
 *
 * Mirrors the procurement/_helpers.ts pattern: centralizes error mapping,
 * permission checks, and transition permission resolution to keep individual
 * routers thin and consistent.
 */
import { TRPCError } from '@trpc/server';
import { getLayer1ActionPermission } from '@fmksa/core';

// ---------------------------------------------------------------------------
// Error mapping — service errors → TRPCError codes
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

/** Check if the user holds a specific permission OR is a system admin. */
export function hasPerm(ctx: { user: { permissions: string[] } }, perm: string): boolean {
  return ctx.user.permissions.includes('system.admin') || ctx.user.permissions.includes(perm);
}

/** Check if the user holds a specific entity permission OR is a system admin. */
export function hasEntityPerm(ctx: { entityPermissions: string[] }, perm: string): boolean {
  return ctx.entityPermissions.includes('system.admin') || ctx.entityPermissions.includes(perm);
}

// ---------------------------------------------------------------------------
// Transition permission resolution — re-export of the Layer 1 permission map
// ---------------------------------------------------------------------------

/**
 * Resolves the required permission code for a Layer 1 transition action.
 * Single source of truth: packages/core/src/layer1/permission-map.ts
 */
export const getTransitionPermission = getLayer1ActionPermission;
