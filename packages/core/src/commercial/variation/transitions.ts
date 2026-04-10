export const VO_TRANSITIONS: Record<string, string[]> = {
  draft: ['submitted'],
  submitted: ['under_review', 'returned', 'rejected'],
  under_review: ['approved_internal', 'returned', 'rejected'],
  returned: ['submitted'],
  approved_internal: ['signed'],
  signed: ['issued'],
  issued: ['client_pending', 'superseded', 'closed'],
  client_pending: ['client_approved', 'client_rejected'],
  client_approved: ['closed'],
};

export const CO_TRANSITIONS: Record<string, string[]> = {
  draft: ['submitted'],
  submitted: ['under_review', 'returned', 'rejected'],
  under_review: ['approved_internal', 'returned', 'rejected'],
  returned: ['submitted'],
  approved_internal: ['signed'],
  signed: ['issued'],
  issued: ['superseded', 'closed'],
};

export const VARIATION_TERMINAL_STATUSES = [
  'rejected',
  'client_rejected',
  'superseded',
  'closed',
];

export function getVariationTransitions(
  subtype: 'vo' | 'change_order',
): Record<string, string[]> {
  return subtype === 'vo' ? VO_TRANSITIONS : CO_TRANSITIONS;
}
