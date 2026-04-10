export const LETTER_TRANSITIONS: Record<string, string[]> = {
  draft: ['under_review'],
  under_review: ['approved_internal', 'returned', 'rejected'],
  returned: ['under_review'],
  approved_internal: ['signed', 'issued'],
  signed: ['issued'],
  issued: ['superseded', 'closed'],
};

export const NOTICE_TRANSITIONS: Record<string, string[]> = {
  draft: ['under_review'],
  under_review: ['approved_internal', 'returned', 'rejected'],
  returned: ['under_review'],
  approved_internal: ['signed'],
  signed: ['issued'],
  issued: ['response_due', 'superseded', 'closed'],
  response_due: ['responded', 'closed'],
  responded: ['closed'],
};

export const CLAIM_TRANSITIONS: Record<string, string[]> = {
  draft: ['under_review'],
  under_review: ['approved_internal', 'returned', 'rejected'],
  returned: ['under_review'],
  approved_internal: ['signed'],
  signed: ['issued'],
  issued: ['under_evaluation', 'superseded', 'closed'],
  under_evaluation: ['partially_accepted', 'accepted', 'disputed', 'closed'],
  partially_accepted: ['closed'],
  accepted: ['closed'],
  disputed: ['under_evaluation', 'closed'],
};

export const BACK_CHARGE_TRANSITIONS: Record<string, string[]> = {
  draft: ['under_review'],
  under_review: ['approved_internal', 'returned', 'rejected'],
  returned: ['under_review'],
  approved_internal: ['signed'],
  signed: ['issued'],
  issued: ['acknowledged', 'disputed', 'superseded', 'closed'],
  acknowledged: ['recovered', 'partially_recovered', 'closed'],
  disputed: ['acknowledged', 'closed'],
  partially_recovered: ['recovered', 'closed'],
  recovered: ['closed'],
};

export const CORRESPONDENCE_TERMINAL_STATUSES = [
  'rejected',
  'superseded',
  'closed',
];

export function getCorrespondenceTransitions(
  subtype: 'letter' | 'notice' | 'claim' | 'back_charge',
): Record<string, string[]> {
  switch (subtype) {
    case 'letter':
      return LETTER_TRANSITIONS;
    case 'notice':
      return NOTICE_TRANSITIONS;
    case 'claim':
      return CLAIM_TRANSITIONS;
    case 'back_charge':
      return BACK_CHARGE_TRANSITIONS;
    default:
      throw new Error(`Unknown correspondence subtype: '${subtype}'`);
  }
}
