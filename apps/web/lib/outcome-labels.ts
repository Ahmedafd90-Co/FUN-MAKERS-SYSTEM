/**
 * Outcome-type label mapping for workflow steps.
 *
 * Maps the outcomeType field ('review' | 'approve' | 'sign' | 'issue' | 'acknowledge')
 * to user-facing labels for buttons, history entries, and status descriptions.
 *
 * Phase 1 Semantics Hardening — keeps all label logic in one place so
 * WorkflowStatusCard, ApprovalList, and ApprovalActions stay in sync.
 */

type OutcomeType = 'review' | 'approve' | 'sign' | 'issue' | 'acknowledge';

/** Primary action button label — what the approver clicks */
export function outcomeActionLabel(outcomeType?: string | null): string {
  const labels: Record<string, string> = {
    review: 'Complete Review',
    approve: 'Approve',
    sign: 'Sign',
    issue: 'Issue',
    acknowledge: 'Acknowledge',
  };
  return labels[outcomeType ?? 'approve'] ?? 'Approve';
}

/** Past-tense label for history — what happened */
export function outcomeCompletedLabel(outcomeType?: string | null): string {
  const labels: Record<string, string> = {
    review: 'Reviewed',
    approve: 'Approved',
    sign: 'Signed',
    issue: 'Issued',
    acknowledge: 'Acknowledged',
  };
  return labels[outcomeType ?? 'approve'] ?? 'Approved';
}

/** "Pending X from:" — describes what's being waited on */
export function outcomePendingLabel(outcomeType?: string | null): string {
  const labels: Record<string, string> = {
    review: 'Pending review from:',
    approve: 'Pending approval from:',
    sign: 'Pending signature from:',
    issue: 'Pending issuance by:',
    acknowledge: 'Pending acknowledgement from:',
  };
  return labels[outcomeType ?? 'approve'] ?? 'Pending approval from:';
}

/** Gerund form — "Reviewing...", "Signing..." for loading states */
export function outcomeProgressLabel(outcomeType?: string | null): string {
  const labels: Record<string, string> = {
    review: 'Completing review...',
    approve: 'Approving...',
    sign: 'Signing...',
    issue: 'Issuing...',
    acknowledge: 'Acknowledging...',
  };
  return labels[outcomeType ?? 'approve'] ?? 'Approving...';
}

/**
 * Short noun form — one word for compact cells.
 *
 * Used by the detail-page summary strip where we need "Review · PM Review"
 * as a tight one-liner. `outcomeActionLabel` returns "Complete Review" which
 * is too long for the summary cell.
 */
export function outcomeShortLabel(outcomeType?: string | null): string {
  const labels: Record<string, string> = {
    review: 'Review',
    approve: 'Approve',
    sign: 'Sign',
    issue: 'Issue',
    acknowledge: 'Acknowledge',
  };
  return labels[outcomeType ?? 'approve'] ?? 'Approve';
}
