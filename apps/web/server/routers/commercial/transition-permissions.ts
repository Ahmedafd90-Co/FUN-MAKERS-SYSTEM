/**
 * Granular permission mapping for commercial transition actions.
 *
 * Replaces the coarse `*.transition` permission check that never existed in the
 * permission catalog.  Each action now maps to the correct granular permission:
 *
 *   submit  → *.submit     (originator submits for review)
 *   review  → *.review     (reviewer moves to under_review)
 *   approve → *.approve    (approver accepts)
 *   reject  → *.approve    (rejection is the negative outcome of approval)
 *   return  → *.review     (reviewer returns for correction)
 *   sign    → *.sign       (signatory digitally signs)
 *   issue   → *.issue      (issuer assigns reference number)
 *   supersede/close → *.issue  (post-issuance administrative actions)
 *
 * Family-specific actions follow the same authority logic:
 *   - Evaluation / dispute → *.review
 *   - Acceptance / acknowledgment → *.approve
 *   - Collection tracking / recovery → *.issue
 */

// ---------------------------------------------------------------------------
// Base mapping (shared across all 6 families)
// ---------------------------------------------------------------------------

const BASE_ACTION_TO_PERMISSION_SUFFIX: Record<string, string> = {
  submit: 'submit',
  review: 'review',
  approve: 'approve',
  reject: 'approve',
  return: 'review',
  sign: 'sign',
  issue: 'issue',
  supersede: 'issue',
  close: 'issue',
};

// ---------------------------------------------------------------------------
// Family-specific extras
// ---------------------------------------------------------------------------

const FAMILY_EXTRAS: Record<string, Record<string, string>> = {
  variation: {
    client_pending: 'issue',
    client_approved: 'approve',
    client_rejected: 'approve',
  },
  cost_proposal: {
    link_to_variation: 'issue',
  },
  tax_invoice: {
    mark_submitted: 'issue',
    mark_partially_collected: 'issue',
    mark_collected: 'issue',
    mark_overdue: 'issue',
    mark_cancelled: 'approve',
  },
  correspondence: {
    mark_response_due: 'issue',
    mark_responded: 'issue',
    evaluate: 'review',
    partially_accept: 'approve',
    accept: 'approve',
    dispute: 'review',
    acknowledge: 'approve',
    recover: 'issue',
    partially_recover: 'issue',
  },
};

// ---------------------------------------------------------------------------
// Permission check helper
// ---------------------------------------------------------------------------

/**
 * Check if the user holds a specific permission OR is a system admin.
 * system.admin acts as a universal bypass for all transition checks.
 */
export function hasPerm(ctx: { user: { permissions: string[] } }, perm: string | null): boolean {
  if (!perm) return false;
  return ctx.user.permissions.includes('system.admin') || ctx.user.permissions.includes(perm);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Returns the granular permission code required for a transition action,
 * e.g. `getTransitionPermission('ipa', 'submit')` → `'ipa.submit'`.
 *
 * Returns `null` for unknown actions (the service layer will reject them
 * separately with "Unknown … action").
 */
export function getTransitionPermission(
  family: string,
  action: string,
): string | null {
  const suffix =
    FAMILY_EXTRAS[family]?.[action] ?? BASE_ACTION_TO_PERMISSION_SUFFIX[action];
  if (!suffix) return null;
  return `${family}.${suffix}`;
}
