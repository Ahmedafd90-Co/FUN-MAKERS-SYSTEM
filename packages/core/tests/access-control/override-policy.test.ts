import { describe, it, expect } from 'vitest';
import {
  isOverrideAllowed,
  requiresSecondApprover,
  isNeverOverridable,
  OVERRIDE_POLICY,
} from '../../src/access-control/override-policy';
import type { OverrideActionType } from '../../src/access-control/override-policy';

describe('override-policy helpers', () => {
  // Verify the three lists are mutually exclusive and collectively exhaustive.
  it('every action appears in exactly one list', () => {
    const all: OverrideActionType[] = [
      'workflow.force_progress',
      'workflow.force_close',
      'workflow.reassign_approver',
      'document.unsign',
      'document.delete',
      'posting.reverse_silently',
      'project_assignment.revoke_immediately',
      'user.unlock_account',
      'user.force_password_reset',
      'reference_data.bulk_edit',
    ];

    for (const action of all) {
      const inAllowed = OVERRIDE_POLICY.allowed.includes(action) ? 1 : 0;
      const inRequires = OVERRIDE_POLICY.requiresSecondApprover.includes(action) ? 1 : 0;
      const inNever = OVERRIDE_POLICY.never.includes(action) ? 1 : 0;
      expect(inAllowed + inRequires + inNever).toBe(1);
    }
  });

  describe('isOverrideAllowed', () => {
    it('returns true for actions in the "allowed" list', () => {
      expect(isOverrideAllowed('workflow.force_progress')).toBe(true);
      expect(isOverrideAllowed('user.unlock_account')).toBe(true);
    });

    it('returns true for actions in the "requiresSecondApprover" list', () => {
      expect(isOverrideAllowed('workflow.force_close')).toBe(true);
      expect(isOverrideAllowed('reference_data.bulk_edit')).toBe(true);
    });

    it('returns false for actions in the "never" list', () => {
      expect(isOverrideAllowed('document.unsign')).toBe(false);
      expect(isOverrideAllowed('document.delete')).toBe(false);
      expect(isOverrideAllowed('posting.reverse_silently')).toBe(false);
    });
  });

  describe('requiresSecondApprover', () => {
    it('returns true for actions that need a second approver', () => {
      expect(requiresSecondApprover('workflow.force_close')).toBe(true);
      expect(requiresSecondApprover('project_assignment.revoke_immediately')).toBe(true);
      expect(requiresSecondApprover('reference_data.bulk_edit')).toBe(true);
    });

    it('returns false for solo-allowed actions', () => {
      expect(requiresSecondApprover('workflow.force_progress')).toBe(false);
      expect(requiresSecondApprover('user.unlock_account')).toBe(false);
    });

    it('returns false for never-overridable actions', () => {
      expect(requiresSecondApprover('document.unsign')).toBe(false);
      expect(requiresSecondApprover('document.delete')).toBe(false);
    });
  });

  describe('isNeverOverridable', () => {
    it('returns true for permanently blocked actions', () => {
      expect(isNeverOverridable('document.unsign')).toBe(true);
      expect(isNeverOverridable('document.delete')).toBe(true);
      expect(isNeverOverridable('posting.reverse_silently')).toBe(true);
    });

    it('returns false for allowed actions', () => {
      expect(isNeverOverridable('workflow.force_progress')).toBe(false);
      expect(isNeverOverridable('user.unlock_account')).toBe(false);
    });

    it('returns false for second-approver actions', () => {
      expect(isNeverOverridable('workflow.force_close')).toBe(false);
      expect(isNeverOverridable('reference_data.bulk_edit')).toBe(false);
    });
  });
});
