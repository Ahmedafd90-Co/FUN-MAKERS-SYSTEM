import { prisma } from '@fmksa/db';
import { auditService, type TransactionClient } from './service';
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
//   4. Executes the wrapped function inside a transaction.
//   5. Writes both audit_logs and override_logs atomically in the same tx.
//
// H2 hardening: fn + auditLog + overrideLog now share a single
// Prisma interactive transaction — all succeed or all roll back.
// ---------------------------------------------------------------------------

export type WithOverrideParams<T> = {
  overrideType: OverrideActionType;
  reason: string;
  actorUserId: string;
  approvedBy?: string; // required for requiresSecondApprover actions
  /**
   * The business action to execute under override governance.
   * Receives a Prisma transaction client so the action's writes share
   * the same commit boundary as the audit + override log entries.
   * Callers that don't need the tx can simply ignore the parameter.
   */
  fn: (tx: TransactionClient) => Promise<T>;
};

/**
 * Execute an action under override governance. All override policy rules
 * are enforced before the action runs. The business action, audit log, and
 * override log are written atomically inside a single Prisma transaction.
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

  // 4. Execute business action + logging in a single transaction
  return prisma.$transaction(async (tx) => {
    // 4a. Execute the business action
    const result = await fn(tx as TransactionClient);

    // 4b. Write audit log entry (within tx)
    const auditEntry = await auditService.log(
      {
        actorUserId,
        actorSource: 'user',
        action: `override.${overrideType}`,
        resourceType: 'override',
        resourceId: overrideType,
        beforeJson: {},
        afterJson: { reason, approvedBy: approvedBy ?? null },
        reason,
      },
      tx as TransactionClient,
    );

    // 4c. Write override log entry (within tx, linked to audit entry)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (tx as any).overrideLog.create({
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
  });
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
