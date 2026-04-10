export const IPA_TRANSITIONS: Record<string, string[]> = {
  draft: ['submitted'],
  submitted: ['under_review', 'returned', 'rejected'],
  under_review: ['approved_internal', 'returned', 'rejected'],
  returned: ['submitted'],
  approved_internal: ['signed', 'issued'],
  signed: ['issued'],
  issued: ['superseded', 'closed'],
};

export const IPA_TERMINAL_STATUSES = ['rejected', 'superseded', 'closed'];
