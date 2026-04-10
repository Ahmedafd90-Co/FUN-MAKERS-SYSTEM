import { prisma } from '@fmksa/db';
import { auditService } from './service';
import {
  type OverrideActionType,
  isNeverOverridable,
  isOverrideAllowed,
  requiresSecondApprover,
} from '../access-control/override-policy';

// ---------------------------------------------------------------------------
// withOverride() — wraps any action that constitutes a Master Admin override.
//
// Enforces the override policy from Pause #3:
//   1. Never-overridable actions are permanently blocked.
//   2. Second-approver actions require an approvedBy userId (not self).
//   3. Unclassified actions are denied by default.
//   4. Executes the wrapped function.
//   5. Writes both audit_logs and override_logs for visibility.
// ---------------------------------------------------------------------------

export type WithOverrideParams<T> = {
  overrideType: OverrideActionType;
  reason: string;
  actorUserId: string;
  approvedBy?: string; // required for requiresSecondApprover actions
  fn: () => Promise<T>;
};

/**
 * Execute an action under override governance. All override policy rules
 * are enforced before the action runs, and both audit + override logs are
 * written on success.
 */
export async function withOverride<T>(
  params: WithOverrideParams<T>,
): Promise<T> {
  const { overrideType, reason, actorUserId, approvedBy, fn } = params;

  // 1. Check if this action type is never overridable
  if (isNeverOverridable(overrideType)) {
    throw new OverrideNotPermittedError(overrideType);
  }

  // 2. Check if action requires second approver
  if (requiresSecondApprover(overrideType)) {
    if (!approvedBy) {
      throw new SecondApproverRequiredError(overrideType);
    }
    if (approvedBy === actorUserId) {
      throw new SelfApprovalProhibitedError(overrideType);
    }
  }

  // 3. Check if action is allowed at all (catches unclassified actions)
  if (!isOverrideAllowed(overrideType)) {
    throw new OverrideNotPermittedError(overrideType);
  }

  // 4. Execute the action
  const result = await fn();

  // 5. Write audit log entry
  const auditEntry = await auditService.log({
    actorUserId,
    actorSource: 'user',
    action: `override.${overrideType}`,
    resourceType: 'override',
    resourceId: overrideType,
    beforeJson: {},
    afterJson: { reason, approvedBy: approvedBy ?? null },
    reason,
  });

  // 6. Write override log entry (separate table for fast admin visibility)
  await prisma.overrideLog.create({
    data: {
      auditLogId: auditEntry.id,
      overrideType,
      overriderUserId: actorUserId,
      reason,
      beforeJson: {},
      afterJson: {},
      approvedBy: approvedBy ?? null,
    },
  });

  return result;
}

// ---------------------------------------------------------------------------
// Error classes
// ---------------------------------------------------------------------------

export class OverrideNotPermittedError extends Error {
  constructor(public overrideType: string) {
    super(
      `Override action '${overrideType}' is not permitted by the override policy.`,
    );
    this.name = 'OverrideNotPermittedError';
  }
}

export class SecondApproverRequiredError extends Error {
  constructor(public overrideType: string) {
    super(
      `Override action '${overrideType}' requires a second approver (approvedBy).`,
    );
    this.name = 'SecondApproverRequiredError';
  }
}

export class SelfApprovalProhibitedError extends Error {
  constructor(public overrideType: string) {
    super(
      `Self-approval is prohibited for override action '${overrideType}'. The approver must be a different user.`,
    );
    this.name = 'SelfApprovalProhibitedError';
  }
}
