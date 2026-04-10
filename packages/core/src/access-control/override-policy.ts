/**
 * Override policy scaffold — Learning Pause #3.
 *
 * This file defines WHICH override actions are allowed, which require a
 * second approver, and which are never overridable.  The lists below are
 * pre-filled with sensible defaults derived from spec §3 and §7.5.
 *
 * Ahmed: review the three lists and confirm / edit before Phase 1.7
 * (withOverride helper) is implemented.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type OverrideActionType =
  | 'workflow.force_progress'
  | 'workflow.force_close'
  | 'workflow.reassign_approver'
  | 'document.unsign'
  | 'document.delete'
  | 'posting.reverse_silently'
  | 'project_assignment.revoke_immediately'
  | 'user.unlock_account'
  | 'user.force_password_reset'
  | 'reference_data.bulk_edit';

export type OverridePolicy = {
  /** Actions any user with `override.execute` can perform solo. */
  allowed: OverrideActionType[];
  /** Actions that additionally require a second approver. */
  requiresSecondApprover: OverrideActionType[];
  /** Actions that may never be overridden, regardless of role. */
  never: OverrideActionType[];
};

// ---------------------------------------------------------------------------
// Policy constant
// ---------------------------------------------------------------------------

// TODO(ahmed): Review and confirm the classification of each override action.
// Move items between the three lists as needed. Every OverrideActionType must
// appear in exactly one list.
export const OVERRIDE_POLICY: OverridePolicy = {
  // TODO(ahmed): Confirm — these can be executed solo by an override-permitted user.
  allowed: [
    'workflow.force_progress',
    'workflow.reassign_approver',
    'user.unlock_account',
    'user.force_password_reset',
  ],

  // TODO(ahmed): Confirm — these require a second approver before execution.
  requiresSecondApprover: [
    'workflow.force_close',
    'project_assignment.revoke_immediately',
    'reference_data.bulk_edit',
  ],

  // TODO(ahmed): Confirm — these are permanently blocked from override.
  never: [
    'document.unsign',
    'document.delete',
    'posting.reverse_silently',
  ],
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Returns `true` if the action can be overridden (either solo or with a
 * second approver).
 */
export function isOverrideAllowed(action: OverrideActionType): boolean {
  return (
    OVERRIDE_POLICY.allowed.includes(action) ||
    OVERRIDE_POLICY.requiresSecondApprover.includes(action)
  );
}

/**
 * Returns `true` if the action requires a second approver to complete.
 */
export function requiresSecondApprover(action: OverrideActionType): boolean {
  return OVERRIDE_POLICY.requiresSecondApprover.includes(action);
}

/**
 * Returns `true` if the action is permanently blocked from override.
 */
export function isNeverOverridable(action: OverrideActionType): boolean {
  return OVERRIDE_POLICY.never.includes(action);
}
