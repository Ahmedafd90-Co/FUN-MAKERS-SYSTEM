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
