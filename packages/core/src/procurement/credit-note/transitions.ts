/**
 * Credit Note status transitions.
 *
 * Module 3 Procurement Engine — Credit Note lifecycle.
 *
 * received -> verified -> applied -> closed
 *                      -> disputed -> verified (re-verify)
 *                                  -> cancelled
 *                      -> cancelled
 */

export const CN_TRANSITIONS: Record<string, string[]> = {
  received: ['verified'],
  verified: ['applied', 'disputed', 'cancelled'],
  applied: ['closed'],
  disputed: ['verified', 'cancelled'],
};

export const CN_TERMINAL_STATUSES = ['closed', 'cancelled'];

export const CN_ACTION_TO_STATUS: Record<string, string> = {
  verify: 'verified',
  apply: 'applied',
  dispute: 'disputed',
  cancel: 'cancelled',
  close: 'closed',
};
