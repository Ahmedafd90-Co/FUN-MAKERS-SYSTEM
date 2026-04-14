// ---------------------------------------------------------------------------
// Engineer Instruction (EI) — Status Transitions
//
// Lifecycle:
//   received -> under_evaluation -> approved_reserve -> converted / rejected / expired
//   received -> rejected                            (fast reject)
//   under_evaluation -> rejected / expired
//   approved_reserve -> rejected / expired           (reserve reversal)
// ---------------------------------------------------------------------------

export const EI_TRANSITIONS: Record<string, string[]> = {
  received: ['under_evaluation', 'rejected'],
  under_evaluation: ['approved_reserve', 'rejected', 'expired'],
  approved_reserve: ['converted', 'rejected', 'expired'],
};

export const EI_TERMINAL_STATUSES = new Set(['converted', 'rejected', 'expired']);

// ---------------------------------------------------------------------------
// Action -> status mapping
// ---------------------------------------------------------------------------

export const EI_ACTION_TO_STATUS: Record<string, string> = {
  evaluate: 'under_evaluation',
  approve_reserve: 'approved_reserve',
  convert: 'converted',
  reject: 'rejected',
  expire: 'expired',
};

// ---------------------------------------------------------------------------
// Allowed actions for a given status
// ---------------------------------------------------------------------------

const STATUS_TO_ACTION: Record<string, string> = Object.fromEntries(
  Object.entries(EI_ACTION_TO_STATUS).map(([action, status]) => [status, action]),
);

/**
 * Return the list of actions allowed from the given EI status.
 * Each action maps 1-to-1 to a target status via EI_ACTION_TO_STATUS.
 */
export function getEiTransitions(currentStatus: string): string[] {
  const allowedStatuses = EI_TRANSITIONS[currentStatus];
  if (!allowedStatuses) return [];

  return allowedStatuses
    .map((status) => STATUS_TO_ACTION[status])
    .filter((action): action is string => action !== undefined);
}
