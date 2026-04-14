/**
 * Shared procurement permission-action mapping.
 *
 * Used by both backend routers (to enforce permissions) and the UI component
 * (to filter action visibility). Single source of truth — no duplicated
 * mapping constants.
 *
 * Stabilization Slice B — real UI permission truth.
 */

/**
 * Maps a transition action to the seeded permission suffix.
 *
 * Seeded permissions use role-intent verbs (submit, review, approve, sign,
 * terminate, etc.). Transition actions include additional verbs (reject,
 * return, expire, supersede, cancel, close) that map to the closest
 * role-intent permission:
 *
 *   - reject / return  -> review  (reviewer can reject or return)
 *   - terminate / supersede / expire / cancel / close -> terminate
 *   - All other actions map directly (submit->submit, approve->approve, etc.)
 */
export const ACTION_TO_PERM_SUFFIX: Record<string, string> = {
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
export function getActionPermission(resource: string, action: string): string {
  const suffix = ACTION_TO_PERM_SUFFIX[action];
  return suffix ? `${resource}.${suffix}` : `${resource}.edit`;
}
