export const IPC_TRANSITIONS: Record<string, string[]> = {
  draft: ['submitted'],
  submitted: ['under_review', 'returned', 'rejected'],
  under_review: ['approved_internal', 'returned', 'rejected'],
  returned: ['submitted'],
  approved_internal: ['signed'],
  signed: ['issued'],
  issued: ['superseded', 'closed'],
};

export const IPC_TERMINAL_STATUSES = ['rejected', 'superseded', 'closed'];

/**
 * Actions that the workflow engine manages during the approval phase.
 * When an active workflow instance exists, these actions cannot be
 * performed as direct transitions — they must go through workflow steps.
 */
export const IPC_WORKFLOW_MANAGED_ACTIONS = ['review', 'approve', 'reject', 'return'];
