export const COST_PROPOSAL_TRANSITIONS: Record<string, string[]> = {
  draft: ['submitted'],
  submitted: ['under_review', 'returned', 'rejected'],
  under_review: ['approved_internal', 'returned', 'rejected'],
  returned: ['submitted'],
  approved_internal: ['issued'],
  issued: ['linked_to_variation', 'superseded', 'closed'],
  linked_to_variation: ['superseded', 'closed'],
};

export const COST_PROPOSAL_TERMINAL_STATUSES = ['rejected', 'superseded', 'closed'];
