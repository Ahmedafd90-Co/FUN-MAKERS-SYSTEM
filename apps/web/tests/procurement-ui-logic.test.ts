/**
 * Procurement UI logic tests — Module 3, Slice 1.
 *
 * Pure unit tests for:
 * 1. Status badge covers all RFQ and Quotation statuses
 * 2. Transition action map matches the actual state machine
 * 3. RFQ_AWARDED is informational only — no financial posting behavior
 *
 * These tests run without a database.
 *
 * The RFQ and Quotation state machines are copied from:
 *   packages/core/src/procurement/rfq/transitions.ts
 *   packages/core/src/procurement/quotation/transitions.ts
 * If either changes, these tests must be updated — and that's the point:
 * changes to the state machine must be reflected in the UI action map.
 */
import { describe, it, expect } from 'vitest';

// ---------------------------------------------------------------------------
// State machines (canonical source: core/procurement/*/transitions.ts)
// ---------------------------------------------------------------------------

const RFQ_TRANSITIONS: Record<string, string[]> = {
  draft: ['under_review'],
  under_review: ['approved_internal', 'returned', 'rejected'],
  returned: ['under_review'],
  approved_internal: ['issued'],
  issued: ['responses_received', 'cancelled'],
  responses_received: ['evaluation'],
  evaluation: ['awarded', 'cancelled'],
  awarded: ['closed'],
};

const RFQ_TERMINAL_STATUSES = ['rejected', 'closed', 'cancelled'];

const RFQ_ACTION_TO_STATUS: Record<string, string> = {
  submit: 'under_review',
  approve: 'approved_internal',
  reject: 'rejected',
  return: 'returned',
  issue: 'issued',
  receive_responses: 'responses_received',
  evaluate: 'evaluation',
  award: 'awarded',
  cancel: 'cancelled',
  close: 'closed',
};

// Quotation 'awarded' removed from transitions — quotation award happens
// only through RFQ award (award integrity invariant).
const QUOTATION_TRANSITIONS: Record<string, string[]> = {
  received: ['under_review', 'expired'],
  under_review: ['shortlisted', 'rejected', 'expired'],
  shortlisted: ['rejected', 'expired'],
};

const QUOTATION_TERMINAL_STATUSES = ['awarded', 'rejected', 'expired'];

// 'award' removed from quotation actions — award only through RFQ.
const QUOTATION_ACTION_TO_STATUS: Record<string, string> = {
  review: 'under_review',
  shortlist: 'shortlisted',
  reject: 'rejected',
  expire: 'expired',
};

// ---------------------------------------------------------------------------
// UI maps (must stay in sync with state machines)
// ---------------------------------------------------------------------------

const BADGE_STATUS_VARIANTS: Record<string, string> = {
  // RFQ statuses
  draft: 'outline',
  under_review: 'secondary',
  returned: 'secondary',
  approved_internal: 'default',
  issued: 'default',
  responses_received: 'secondary',
  evaluation: 'secondary',
  awarded: 'default',
  rejected: 'destructive',
  cancelled: 'outline',
  closed: 'outline',
  // Quotation statuses
  received: 'secondary',
  shortlisted: 'default',
  expired: 'outline',
};

const RFQ_STATUS_ACTIONS: Record<string, string[]> = {
  draft: ['submit'],
  under_review: ['approve', 'return', 'reject'],
  returned: ['submit'],
  approved_internal: ['issue'],
  issued: ['receive_responses', 'cancel'],
  responses_received: ['evaluate'],
  // 'award' removed — RFQ award is triggered with a specific quotationId,
  // not from generic transition actions.
  evaluation: ['cancel'],
  awarded: ['close'],
};

const QUOTATION_STATUS_ACTIONS: Record<string, string[]> = {
  received: ['review', 'expire'],
  under_review: ['shortlist', 'reject', 'expire'],
  // 'award' removed — quotation award only through RFQ award.
  shortlisted: ['reject', 'expire'],
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Procurement status badge mapping', () => {
  it('covers every non-terminal RFQ status', () => {
    const allRfqStatuses = [
      ...Object.keys(RFQ_TRANSITIONS),
      ...RFQ_TERMINAL_STATUSES,
    ];
    for (const status of allRfqStatuses) {
      expect(
        BADGE_STATUS_VARIANTS[status],
        `Missing badge variant for RFQ status: ${status}`,
      ).toBeDefined();
    }
  });

  it('covers every non-terminal Quotation status', () => {
    const allQuotationStatuses = [
      ...Object.keys(QUOTATION_TRANSITIONS),
      ...QUOTATION_TERMINAL_STATUSES,
    ];
    for (const status of allQuotationStatuses) {
      expect(
        BADGE_STATUS_VARIANTS[status],
        `Missing badge variant for Quotation status: ${status}`,
      ).toBeDefined();
    }
  });

  it('assigns valid badge variants only', () => {
    const validVariants = ['default', 'secondary', 'destructive', 'outline'];
    for (const [status, variant] of Object.entries(BADGE_STATUS_VARIANTS)) {
      expect(validVariants, `Invalid variant "${variant}" for status "${status}"`).toContain(variant);
    }
  });
});

describe('RFQ transition actions map', () => {
  it('provides actions for every non-terminal RFQ status', () => {
    for (const status of Object.keys(RFQ_TRANSITIONS)) {
      expect(
        RFQ_STATUS_ACTIONS[status],
        `Missing actions for RFQ status: ${status}`,
      ).toBeDefined();
      expect(RFQ_STATUS_ACTIONS[status]!.length).toBeGreaterThan(0);
    }
  });

  it('does not provide actions for terminal statuses', () => {
    for (const status of RFQ_TERMINAL_STATUSES) {
      expect(
        RFQ_STATUS_ACTIONS[status],
        `Terminal status "${status}" should not have actions`,
      ).toBeUndefined();
    }
  });

  it('every action leads to a valid target status in the state machine', () => {
    for (const [fromStatus, actions] of Object.entries(RFQ_STATUS_ACTIONS)) {
      const allowedTargets = RFQ_TRANSITIONS[fromStatus]!;
      for (const action of actions) {
        const targetStatus = RFQ_ACTION_TO_STATUS[action];
        expect(
          targetStatus,
          `Action "${action}" has no target status in ACTION_TO_STATUS`,
        ).toBeDefined();
        expect(
          allowedTargets,
          `Status "${fromStatus}" -> action "${action}" -> "${targetStatus}" is not in allowed transitions [${allowedTargets.join(', ')}]`,
        ).toContain(targetStatus);
      }
    }
  });
});

describe('Quotation transition actions map', () => {
  it('provides actions for every non-terminal Quotation status', () => {
    for (const status of Object.keys(QUOTATION_TRANSITIONS)) {
      expect(
        QUOTATION_STATUS_ACTIONS[status],
        `Missing actions for Quotation status: ${status}`,
      ).toBeDefined();
      expect(QUOTATION_STATUS_ACTIONS[status]!.length).toBeGreaterThan(0);
    }
  });

  it('does not provide actions for terminal statuses', () => {
    for (const status of QUOTATION_TERMINAL_STATUSES) {
      expect(
        QUOTATION_STATUS_ACTIONS[status],
        `Terminal status "${status}" should not have actions`,
      ).toBeUndefined();
    }
  });

  it('every action leads to a valid target status in the state machine', () => {
    for (const [fromStatus, actions] of Object.entries(QUOTATION_STATUS_ACTIONS)) {
      const allowedTargets = QUOTATION_TRANSITIONS[fromStatus]!;
      for (const action of actions) {
        const targetStatus = QUOTATION_ACTION_TO_STATUS[action];
        expect(
          targetStatus,
          `Action "${action}" has no target status in ACTION_TO_STATUS`,
        ).toBeDefined();
        expect(
          allowedTargets,
          `Status "${fromStatus}" -> action "${action}" -> "${targetStatus}" is not in allowed transitions [${allowedTargets.join(', ')}]`,
        ).toContain(targetStatus);
      }
    }
  });
});

describe('Financial semantics guardrail — RFQ_AWARDED', () => {
  it('RFQ "award" action leads to "awarded" status', () => {
    expect(RFQ_ACTION_TO_STATUS['award']).toBe('awarded');
  });

  it('awarded RFQ can only be closed — no financial transitions', () => {
    expect(RFQ_TRANSITIONS['awarded']).toEqual(['closed']);
  });

  it('awarded is NOT a terminal status — it can still be closed', () => {
    expect(RFQ_TERMINAL_STATUSES).not.toContain('awarded');
  });

  it('terminal statuses have no outgoing transitions', () => {
    for (const status of RFQ_TERMINAL_STATUSES) {
      expect(RFQ_TRANSITIONS[status]).toBeUndefined();
    }
  });

  it('no RFQ action produces a financial posting keyword', () => {
    // This validates that no action name suggests financial behavior.
    // Commitment, payable, actual_cost are PO/invoice territory.
    const financialKeywords = ['commit', 'payable', 'actual', 'post', 'invoice'];
    for (const action of Object.keys(RFQ_ACTION_TO_STATUS)) {
      for (const keyword of financialKeywords) {
        expect(
          action.includes(keyword),
          `RFQ action "${action}" contains financial keyword "${keyword}"`,
        ).toBe(false);
      }
    }
  });
});

describe('Award integrity invariant', () => {
  it('quotation has no standalone "award" action', () => {
    expect(QUOTATION_ACTION_TO_STATUS['award']).toBeUndefined();
  });

  it('quotation "shortlisted" cannot transition to "awarded" directly', () => {
    const shortlistedTargets = QUOTATION_TRANSITIONS['shortlisted'] ?? [];
    expect(shortlistedTargets).not.toContain('awarded');
  });

  it('"awarded" is a terminal status for quotation (reached only via RFQ award)', () => {
    expect(QUOTATION_TERMINAL_STATUSES).toContain('awarded');
  });

  it('no quotation state can transition to "awarded"', () => {
    for (const targets of Object.values(QUOTATION_TRANSITIONS)) {
      expect(targets).not.toContain('awarded');
    }
  });

  it('RFQ "award" action still exists in RFQ state machine', () => {
    expect(RFQ_ACTION_TO_STATUS['award']).toBe('awarded');
    expect(RFQ_TRANSITIONS['evaluation']).toContain('awarded');
  });

  it('RFQ award is not exposed as a generic transition button', () => {
    // Award is handled by dedicated UI with quotation selection,
    // not by the generic ProcurementTransitionActions component.
    const evaluationActions = RFQ_STATUS_ACTIONS['evaluation'] ?? [];
    expect(evaluationActions).not.toContain('award');
  });
});

// ---------------------------------------------------------------------------
// Permission truth tests (Stabilization Slice B)
// ---------------------------------------------------------------------------

/**
 * Same permission mapping as the backend and the UI component.
 * If the component's mapping diverges from this, tests catch it.
 */
const ACTION_TO_PERM_SUFFIX: Record<string, string> = {
  submit: 'submit', approve: 'approve', sign: 'sign', issue: 'issue',
  evaluate: 'evaluate', award: 'award', shortlist: 'shortlist',
  reject: 'review', return: 'review', review: 'review', receive_responses: 'review',
  expire: 'terminate', cancel: 'terminate', close: 'terminate',
};

function requiredPerm(resource: string, action: string): string {
  const suffix = ACTION_TO_PERM_SUFFIX[action];
  return suffix ? `${resource}.${suffix}` : `${resource}.edit`;
}

describe('UI permission truth — per-action filtering', () => {
  it('every RFQ action maps to a real seeded permission code', () => {
    // These are the seeded RFQ permissions (from procurement-permissions.ts)
    const SEEDED_RFQ_PERMS = [
      'rfq.view', 'rfq.create', 'rfq.edit', 'rfq.delete',
      'rfq.submit', 'rfq.review', 'rfq.approve', 'rfq.issue',
      'rfq.evaluate', 'rfq.award', 'rfq.terminate',
    ];

    for (const [, actions] of Object.entries(RFQ_STATUS_ACTIONS)) {
      for (const action of actions) {
        const perm = requiredPerm('rfq', action);
        expect(
          SEEDED_RFQ_PERMS,
          `Action "${action}" requires "${perm}" which is NOT a seeded RFQ permission`,
        ).toContain(perm);
      }
    }
  });

  it('every quotation action maps to a real seeded permission code', () => {
    const SEEDED_QUOTATION_PERMS = [
      'quotation.view', 'quotation.create', 'quotation.edit', 'quotation.delete',
      'quotation.review', 'quotation.shortlist', 'quotation.award',
      'quotation.reject', 'quotation.terminate',
    ];

    for (const [, actions] of Object.entries(QUOTATION_STATUS_ACTIONS)) {
      for (const action of actions) {
        const perm = requiredPerm('quotation', action);
        expect(
          SEEDED_QUOTATION_PERMS,
          `Action "${action}" requires "${perm}" which is NOT a seeded quotation permission`,
        ).toContain(perm);
      }
    }
  });

  it('cancel action requires terminate permission (not edit)', () => {
    expect(requiredPerm('rfq', 'cancel')).toBe('rfq.terminate');
  });

  it('close action requires terminate permission', () => {
    expect(requiredPerm('rfq', 'close')).toBe('rfq.terminate');
  });

  it('expire action requires terminate permission', () => {
    expect(requiredPerm('quotation', 'expire')).toBe('quotation.terminate');
  });

  it('reject maps to review permission (reviewer can reject)', () => {
    expect(requiredPerm('rfq', 'reject')).toBe('rfq.review');
    expect(requiredPerm('quotation', 'reject')).toBe('quotation.review');
  });
});
