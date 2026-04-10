/**
 * Override Policy — Pico Play Fun Makers KSA
 *
 * Approved by Ahmed Al-Dossary on 2026-04-10 (Pause #3).
 *
 * Rules governing ALL override actions:
 *
 * 1. Every override must be exceptional, visible, and auditable.
 * 2. No override may violate these non-negotiable principles:
 *    - signed document immutability
 *    - no hard delete of critical records
 *    - additive reversal only for posting
 *    - project isolation rules
 * 3. If a future override action is not explicitly classified, treat it as
 *    DENIED by default until classified and added to this policy.
 * 4. Override actions must never silently mutate history.
 * 5. Override actions must never bypass audit logging.
 * 6. If an override affects access, workflow ownership, or record lifecycle,
 *    capture both: operator and business reason.
 * 7. For requiresSecondApprover actions, the initiator CANNOT be the second
 *    approver (self-approval is prohibited).
 * 8. For requiresSecondApprover actions, execution happens ONLY after explicit
 *    secondary approval is recorded.
 * 9. Override logs should be easy to review separately from general audit logs.
 *
 * Implementation: Phase 1.7 Task 1.7.6 builds the withOverride() helper that
 * enforces these rules. This file defines the classification only.
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

export const OVERRIDE_POLICY: OverridePolicy = {
  /**
   * Category 1: allowed (solo)
   * Master Admin may perform alone, always with:
   * - mandatory reason note
   * - audit log
   * - before/after capture where applicable
   */
  allowed: [
    'workflow.force_progress',
    'workflow.reassign_approver',
    'user.unlock_account',
    'user.force_password_reset',
  ],

  /**
   * Category 2: requiresSecondApprover
   * Requires a second Master Admin approval before execution, plus:
   * - mandatory reason note
   * - audit log
   * - explicit approval record
   * - before/after capture where applicable
   * - initiator CANNOT be the second approver
   * - execution only after secondary approval is recorded
   */
  requiresSecondApprover: [
    'workflow.force_close',
    'project_assignment.revoke_immediately',
    'reference_data.bulk_edit',
  ],

  /**
   * Category 3: never
   * Never allowed, even by Master Admin. These would violate:
   * - signed document immutability (document.unsign)
   * - no hard delete of critical records (document.delete)
   * - additive reversal only for posting (posting.reverse_silently)
   */
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
 * second approver). Unclassified actions return `false` (denied by default
 * per override rule #3).
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
