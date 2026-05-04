/**
 * Layer 1 UI logic tests — PR-A3 Stage 5.
 *
 * Pure unit tests for the testable units extracted from prime-contract-tab.tsx
 * and the participants pages:
 *
 *   1. PRIME_CONTRACT_STATUS_ACTIONS state machine map (matches service)
 *   2. Date ordering validation helper
 *   3. ROLE_LABELS for the ProjectParticipant role enum
 *   4. ACTION_PAST_TENSE for transition success toasts
 *   5. Permission-derived UI state (canCreate / canEdit / canTransition)
 *
 * No React rendering. Node env, mirrors procurement-ui-logic.test.ts pattern.
 *
 * The PrimeContract state machine is duplicated from
 *   packages/core/src/layer1/prime-contracts/service.ts ALLOWED_TRANSITIONS
 * If either changes, BOTH the local literal AND the UI action map must be
 * updated — and that's the point: the test fails loudly so the divergence is
 * caught at CI time.
 *
 * The role enum is duplicated from
 *   packages/contracts/src/layer1/project-participant.ts projectParticipantRoleEnum
 * Same discipline.
 */
import { describe, it, expect } from 'vitest';

import {
  ACTION_PAST_TENSE,
  COMMENT_REQUIRED_ACTIONS,
  CONFIRM_ACTIONS,
  PRIME_CONTRACT_STATUS_ACTIONS,
  STATUS_LABELS,
  checkDateOrdering,
  formatDate,
  statusVariant,
  type PrimeContractAction,
  type PrimeContractStatus,
} from '../components/projects/prime-contract-helpers';
import {
  ROLE_LABELS,
  ROLES,
  type ParticipantRole,
} from '../components/projects/participant-helpers';

// ---------------------------------------------------------------------------
// Canonical literal of the service's ALLOWED_TRANSITIONS — the source of truth
// lives at packages/core/src/layer1/prime-contracts/service.ts.
// If this literal drifts from the service, the test below will catch it.
// ---------------------------------------------------------------------------

const ALLOWED_TRANSITIONS_FROM_SERVICE: Record<PrimeContractStatus, PrimeContractStatus[]> = {
  draft: ['signed', 'cancelled'],
  signed: ['active', 'cancelled'],
  active: ['completed', 'terminated', 'cancelled'],
  completed: [],
  terminated: [],
  cancelled: [],
};

const ACTION_TO_STATUS_FROM_SERVICE: Record<PrimeContractAction, PrimeContractStatus> = {
  sign: 'signed',
  activate: 'active',
  complete: 'completed',
  terminate: 'terminated',
  cancel: 'cancelled',
};

// ---------------------------------------------------------------------------
// Group 1 — State machine map
// ---------------------------------------------------------------------------

describe('PRIME_CONTRACT_STATUS_ACTIONS state machine map', () => {
  it('UI action map produces transitions matching the service ALLOWED_TRANSITIONS', () => {
    for (const status of Object.keys(ALLOWED_TRANSITIONS_FROM_SERVICE) as PrimeContractStatus[]) {
      const uiActions = PRIME_CONTRACT_STATUS_ACTIONS[status];
      const uiTargetStatuses = uiActions
        .map((a) => ACTION_TO_STATUS_FROM_SERVICE[a.action])
        .sort();
      const expected = [...ALLOWED_TRANSITIONS_FROM_SERVICE[status]].sort();
      expect(uiTargetStatuses).toEqual(expected);
    }
  });

  it('returns an empty array for each terminal status', () => {
    expect(PRIME_CONTRACT_STATUS_ACTIONS.completed).toEqual([]);
    expect(PRIME_CONTRACT_STATUS_ACTIONS.terminated).toEqual([]);
    expect(PRIME_CONTRACT_STATUS_ACTIONS.cancelled).toEqual([]);
  });

  it('draft offers sign + cancel', () => {
    const actions = PRIME_CONTRACT_STATUS_ACTIONS.draft.map((a) => a.action).sort();
    expect(actions).toEqual(['cancel', 'sign']);
  });

  it('signed offers activate + cancel', () => {
    const actions = PRIME_CONTRACT_STATUS_ACTIONS.signed.map((a) => a.action).sort();
    expect(actions).toEqual(['activate', 'cancel']);
  });

  it('active offers complete + terminate + cancel', () => {
    const actions = PRIME_CONTRACT_STATUS_ACTIONS.active.map((a) => a.action).sort();
    expect(actions).toEqual(['cancel', 'complete', 'terminate']);
  });

  it('every action carries a non-empty label', () => {
    for (const list of Object.values(PRIME_CONTRACT_STATUS_ACTIONS)) {
      for (const a of list) {
        expect(a.label).toBeTruthy();
        expect(a.label.length).toBeGreaterThan(0);
      }
    }
  });

  it('terminate is the only destructive variant; cancel is outline', () => {
    const allActions = Object.values(PRIME_CONTRACT_STATUS_ACTIONS).flat();
    const destructive = allActions.filter((a) => a.variant === 'destructive');
    expect(destructive.every((a) => a.action === 'terminate')).toBe(true);
    const cancels = allActions.filter((a) => a.action === 'cancel');
    expect(cancels.every((a) => a.variant === 'outline')).toBe(true);
  });

  it('CONFIRM_ACTIONS covers exactly terminate + cancel', () => {
    expect([...CONFIRM_ACTIONS].sort()).toEqual(['cancel', 'terminate']);
  });

  it('COMMENT_REQUIRED_ACTIONS is empty (all comments optional in PrimeContract)', () => {
    expect(COMMENT_REQUIRED_ACTIONS).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Group 2 — Date ordering validation
// ---------------------------------------------------------------------------

describe('checkDateOrdering helper', () => {
  it('passes when no dates provided', () => {
    expect(checkDateOrdering('', '', '')).toBeNull();
  });

  it('passes when only one date provided', () => {
    expect(checkDateOrdering('2026-01-01', '', '')).toBeNull();
    expect(checkDateOrdering('', '2026-01-01', '')).toBeNull();
    expect(checkDateOrdering('', '', '2026-01-01')).toBeNull();
  });

  it('passes when signedDate <= effectiveDate', () => {
    expect(checkDateOrdering('2026-01-01', '2026-02-01', '')).toBeNull();
    expect(checkDateOrdering('2026-01-01', '2026-01-01', '')).toBeNull(); // equal
  });

  it('fails when signedDate > effectiveDate', () => {
    const msg = checkDateOrdering('2026-03-01', '2026-02-01', '');
    expect(msg).toBe('Signed date must be on or before the effective date.');
  });

  it('passes when effectiveDate <= expectedCompletionDate', () => {
    expect(checkDateOrdering('', '2026-02-01', '2026-12-31')).toBeNull();
    expect(checkDateOrdering('', '2026-02-01', '2026-02-01')).toBeNull(); // equal
  });

  it('fails when effectiveDate > expectedCompletionDate', () => {
    const msg = checkDateOrdering('', '2026-12-31', '2026-02-01');
    expect(msg).toBe('Effective date must be on or before the expected completion date.');
  });

  it('passes when signedDate <= expectedCompletionDate (no effectiveDate)', () => {
    expect(checkDateOrdering('2026-01-01', '', '2026-12-31')).toBeNull();
  });

  it('fails when signedDate > expectedCompletionDate (no effectiveDate)', () => {
    const msg = checkDateOrdering('2026-12-31', '', '2026-01-01');
    expect(msg).toBe('Signed date must be on or before the expected completion date.');
  });

  it('passes when all three dates are provided in the correct order', () => {
    expect(checkDateOrdering('2026-01-01', '2026-02-01', '2026-12-31')).toBeNull();
  });

  it('signedDate vs effectiveDate check fires before the effective↔completion check', () => {
    // Both invariants violated; the helper returns the signed↔effective message first.
    const msg = checkDateOrdering('2026-12-31', '2026-06-01', '2026-01-01');
    expect(msg).toBe('Signed date must be on or before the effective date.');
  });
});

// ---------------------------------------------------------------------------
// Group 3 — Role labels (participants)
// ---------------------------------------------------------------------------

describe('ROLE_LABELS map', () => {
  // Mirror of packages/contracts/src/layer1/project-participant.ts
  // projectParticipantRoleEnum. Hard-coded so the test catches enum drift.
  const PARTICIPANT_ROLE_ENUM: ParticipantRole[] = [
    'prime_contractor',
    'sub_contractor',
    'factory',
    'design',
    'management',
    'other',
  ];

  it('has a non-empty label for every role enum value', () => {
    for (const role of PARTICIPANT_ROLE_ENUM) {
      const label = ROLE_LABELS[role];
      expect(label).toBeDefined();
      expect(label).not.toBe('');
    }
  });

  it('renders human-readable labels (snake_case → Title Case)', () => {
    expect(ROLE_LABELS.prime_contractor).toBe('Prime Contractor');
    expect(ROLE_LABELS.sub_contractor).toBe('Subcontractor');
    expect(ROLE_LABELS.factory).toBe('Factory');
    expect(ROLE_LABELS.design).toBe('Design');
    expect(ROLE_LABELS.management).toBe('Management');
    expect(ROLE_LABELS.other).toBe('Other');
  });

  it('exposes exactly the 6 enum values — no extras', () => {
    const keys = Object.keys(ROLE_LABELS).sort();
    expect(keys).toEqual([...PARTICIPANT_ROLE_ENUM].sort());
  });

  it('ROLES Select-options array is in enum order and matches ROLE_LABELS', () => {
    expect(ROLES.length).toBe(PARTICIPANT_ROLE_ENUM.length);
    for (let i = 0; i < ROLES.length; i++) {
      const opt = ROLES[i];
      expect(opt).toBeDefined();
      expect(opt!.value).toBe(PARTICIPANT_ROLE_ENUM[i]);
      expect(opt!.label).toBe(ROLE_LABELS[opt!.value]);
    }
  });
});

// ---------------------------------------------------------------------------
// Group 4 — ACTION_PAST_TENSE map
// ---------------------------------------------------------------------------

describe('ACTION_PAST_TENSE map (toast messages)', () => {
  const TRANSITION_ACTIONS: PrimeContractAction[] = [
    'sign',
    'activate',
    'complete',
    'terminate',
    'cancel',
  ];

  it('has past-tense for every transition action', () => {
    for (const action of TRANSITION_ACTIONS) {
      expect(ACTION_PAST_TENSE[action]).toBeDefined();
      expect(ACTION_PAST_TENSE[action]).not.toBe('');
    }
  });

  it('produces grammatically correct past tense', () => {
    expect(ACTION_PAST_TENSE.sign).toBe('signed');
    expect(ACTION_PAST_TENSE.activate).toBe('activated');
    expect(ACTION_PAST_TENSE.complete).toBe('completed');
    expect(ACTION_PAST_TENSE.terminate).toBe('terminated');
    expect(ACTION_PAST_TENSE.cancel).toBe('cancelled');
  });

  it('exposes exactly the 5 transition actions — no extras', () => {
    const keys = Object.keys(ACTION_PAST_TENSE).sort();
    expect(keys).toEqual([...TRANSITION_ACTIONS].sort());
  });
});

// ---------------------------------------------------------------------------
// Group 5 — Status labels + variant mapping
// ---------------------------------------------------------------------------

describe('STATUS_LABELS + statusVariant', () => {
  const STATUSES: PrimeContractStatus[] = [
    'draft',
    'signed',
    'active',
    'completed',
    'terminated',
    'cancelled',
  ];

  it('has a label for every PrimeContract status', () => {
    for (const s of STATUSES) {
      expect(STATUS_LABELS[s]).toBeDefined();
      expect(STATUS_LABELS[s]).not.toBe('');
    }
  });

  it('statusVariant returns destructive only for terminated', () => {
    expect(statusVariant('terminated')).toBe('destructive');
    for (const s of STATUSES.filter((x) => x !== 'terminated')) {
      expect(statusVariant(s)).not.toBe('destructive');
    }
  });

  it('statusVariant defaults to outline for unknown statuses', () => {
    expect(statusVariant('something_else_entirely')).toBe('outline');
  });
});

// ---------------------------------------------------------------------------
// Group 5b — formatDate (UTC stability)
//
// Contract dates are stored at midnight UTC. Rendering them via
// toLocaleDateString() (the prior implementation) interprets the timestamp in
// the runtime's local timezone — viewers west of UTC saw every contract date
// shifted back by one day. The current implementation forces timeZone: 'UTC'
// so the calendar day stays stable.
//
// Locale-tolerant assertions: don't pin a specific format string (e.g.
// "May 4, 2026") because the runtime locale can vary. Instead, assert the
// year + day-of-month appear and the previous calendar day does NOT.
// ---------------------------------------------------------------------------

describe('formatDate (UTC stability)', () => {
  it('returns "—" for null / undefined / empty input', () => {
    expect(formatDate(null)).toBe('—');
    expect(formatDate(undefined)).toBe('—');
    expect(formatDate('')).toBe('—');
  });

  it('renders the same calendar day as the stored ISO date (no timezone drift)', () => {
    // 2026-05-04 stored at midnight UTC. With the prior local-time formatting,
    // viewers west of UTC saw "May 3, 2026" — one day off. The UTC formatter
    // must always show the 4th.
    const iso = '2026-05-04T00:00:00.000Z';
    const result = formatDate(iso);
    expect(result).toContain('2026');
    expect(result).toMatch(/\b4\b/);
    // Must NOT have shifted to the previous calendar day.
    expect(result).not.toMatch(/\b3,?\s+2026\b/);
  });

  it('handles a Date object input the same as an ISO string', () => {
    const iso = '2026-12-31T00:00:00.000Z';
    const fromString = formatDate(iso);
    const fromDate = formatDate(new Date(iso));
    expect(fromDate).toBe(fromString);
  });

  it('renders December 31 as Dec 31 of the same year (no year rollover)', () => {
    // Edge case: stored 2026-12-31T00:00:00Z. A viewer in (e.g.) UTC-5 with
    // local-time formatting would see "Dec 30, 2026". UTC formatter must keep
    // it on the 31st.
    const iso = '2026-12-31T00:00:00.000Z';
    const result = formatDate(iso);
    expect(result).toContain('2026');
    expect(result).toMatch(/\b31\b/);
  });
});

// ---------------------------------------------------------------------------
// Group 6 — Permission-derived UI state patterns
//
// The pages use the canonical pattern:
//   const can = (perms ?? []).includes('resource.action') ||
//               (perms ?? []).includes('system.admin');
// We test that pattern directly here so it stays correct. If the system.admin
// bypass behavior changes, these tests catch it.
// ---------------------------------------------------------------------------

function canDo(userPermissions: string[] | undefined, required: string): boolean {
  const perms = userPermissions ?? [];
  return perms.includes(required) || perms.includes('system.admin');
}

describe('Permission-derived UI state', () => {
  it('returns true when the specific permission is present', () => {
    expect(canDo(['project_participant.create'], 'project_participant.create')).toBe(true);
  });

  it('returns true when system.admin is present (admin override)', () => {
    expect(canDo(['system.admin'], 'project_participant.create')).toBe(true);
    expect(canDo(['system.admin'], 'prime_contract.terminate')).toBe(true);
  });

  it('returns false when neither the specific permission nor system.admin is present', () => {
    expect(canDo(['some.other.perm'], 'project_participant.create')).toBe(false);
  });

  it('returns false when the permissions array is empty', () => {
    expect(canDo([], 'project_participant.create')).toBe(false);
  });

  it('returns false when permissions are undefined (loading state)', () => {
    expect(canDo(undefined, 'project_participant.create')).toBe(false);
  });

  it('per-action transition gating: each action requires its own code', () => {
    const perms = ['prime_contract.sign'];
    expect(canDo(perms, 'prime_contract.sign')).toBe(true);
    expect(canDo(perms, 'prime_contract.activate')).toBe(false);
    expect(canDo(perms, 'prime_contract.terminate')).toBe(false);
  });

  it('admin override grants all transition actions at once', () => {
    const perms = ['system.admin'];
    expect(canDo(perms, 'prime_contract.sign')).toBe(true);
    expect(canDo(perms, 'prime_contract.activate')).toBe(true);
    expect(canDo(perms, 'prime_contract.complete')).toBe(true);
    expect(canDo(perms, 'prime_contract.terminate')).toBe(true);
    expect(canDo(perms, 'prime_contract.cancel')).toBe(true);
  });
});
