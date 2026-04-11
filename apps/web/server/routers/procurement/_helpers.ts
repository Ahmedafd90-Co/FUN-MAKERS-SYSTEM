/**
 * Shared helpers for procurement routers — Hardening patch H3.
 *
 * Centralizes error mapping, permission checking, and transition
 * permission resolution to eliminate duplication and ensure
 * router permission checks match seeded permission codes exactly.
 */
import { TRPCError } from '@trpc/server';

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
// Entity permission check
// ---------------------------------------------------------------------------

export function hasEntityPerm(ctx: { entityPermissions: string[] }, perm: string): boolean {
  return ctx.entityPermissions.includes('system.admin') || ctx.entityPermissions.includes(perm);
}

// ---------------------------------------------------------------------------
// Transition permission resolution
// ---------------------------------------------------------------------------

/**
 * Maps a transition action to the seeded permission suffix.
 *
 * Seeded permissions use role-intent verbs (submit, review, approve, sign,
 * terminate, etc.). Transition actions include additional verbs (reject,
 * return, expire, supersede, cancel, close) that map to the closest
 * role-intent permission:
 *
 *   - reject / return  → review  (reviewer can reject or return)
 *   - terminate / supersede / expire / cancel / close → terminate
 *   - All other actions map directly (submit→submit, approve→approve, etc.)
 */
const ACTION_TO_PERM_SUFFIX: Record<string, string> = {
  // Direct seed matches
  submit: 'submit',
  approve: 'approve',
  sign: 'sign',
  issue: 'issue',
  activate: 'activate',
  suspend: 'suspend',
  blacklist: 'blacklist',
  evaluate: 'evaluate',
  award: 'award',
  shortlist: 'shortlist',
  verify: 'verify',
  apply: 'apply',
  prepare_payment: 'prepare_payment',
  // Reviewer actions
  reject: 'review',
  return: 'review',
  review: 'review',
  receive_responses: 'review',
  // Terminal management actions
  terminate: 'terminate',
  supersede: 'terminate',
  expire: 'terminate',
  cancel: 'terminate',
  close: 'terminate',
};

/**
 * Resolves the required permission code for a transition action.
 * Returns `{resource}.{permSuffix}` or falls back to `{resource}.edit`.
 */
export function getTransitionPermission(resource: string, action: string): string {
  const suffix = ACTION_TO_PERM_SUFFIX[action];
  return suffix ? `${resource}.${suffix}` : `${resource}.edit`;
}
