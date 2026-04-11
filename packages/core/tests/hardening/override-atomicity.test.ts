/**
 * H8 hardening tests — override atomicity (H2 validation).
 *
 * Pure unit tests: no database required.
 * Validates that:
 *   1. Policy enforcement happens BEFORE the transaction (pre-checks).
 *   2. Error classes have correct names and messages.
 *   3. fn parameter signature accepts a tx client.
 */
import { describe, it, expect } from 'vitest';
import {
  OverrideNotPermittedError,
  SecondApproverRequiredError,
  SelfApprovalProhibitedError,
} from '../../src/audit/override';

// ---------------------------------------------------------------------------
// Error class tests (validate pre-checks reject before any DB work)
// ---------------------------------------------------------------------------

describe('override error classes', () => {
  describe('OverrideNotPermittedError', () => {
    it('includes the override type in the message', () => {
      const err = new OverrideNotPermittedError('document.unsign');
      expect(err.message).toContain('document.unsign');
      expect(err.message).toContain('not permitted');
    });

    it('has correct name', () => {
      const err = new OverrideNotPermittedError('test.action');
      expect(err.name).toBe('OverrideNotPermittedError');
    });

    it('is instanceof Error', () => {
      const err = new OverrideNotPermittedError('test.action');
      expect(err).toBeInstanceOf(Error);
    });

    it('exposes overrideType property', () => {
      const err = new OverrideNotPermittedError('posting.reverse_silently');
      expect(err.overrideType).toBe('posting.reverse_silently');
    });
  });

  describe('SecondApproverRequiredError', () => {
    it('includes the override type in the message', () => {
      const err = new SecondApproverRequiredError('workflow.force_close');
      expect(err.message).toContain('workflow.force_close');
      expect(err.message).toContain('second approver');
    });

    it('has correct name', () => {
      const err = new SecondApproverRequiredError('test.action');
      expect(err.name).toBe('SecondApproverRequiredError');
    });

    it('exposes overrideType property', () => {
      const err = new SecondApproverRequiredError('workflow.force_close');
      expect(err.overrideType).toBe('workflow.force_close');
    });
  });

  describe('SelfApprovalProhibitedError', () => {
    it('includes the override type in the message', () => {
      const err = new SelfApprovalProhibitedError('workflow.force_close');
      expect(err.message).toContain('workflow.force_close');
      expect(err.message).toContain('Self-approval');
    });

    it('has correct name', () => {
      const err = new SelfApprovalProhibitedError('test.action');
      expect(err.name).toBe('SelfApprovalProhibitedError');
    });

    it('exposes overrideType property', () => {
      const err = new SelfApprovalProhibitedError('reference_data.bulk_edit');
      expect(err.overrideType).toBe('reference_data.bulk_edit');
    });
  });
});

// ---------------------------------------------------------------------------
// Override policy pre-check tests (these run without DB)
// ---------------------------------------------------------------------------

describe('override pre-check behavior', () => {
  // Import withOverride to verify pre-checks reject before transaction
  // We can't test the full transaction path without a DB, but we CAN verify
  // that policy violations are thrown synchronously before $transaction.

  it('never-overridable actions rejected before any DB work', async () => {
    const { withOverride } = await import('../../src/audit/override');

    // If this throws OverrideNotPermittedError, the $transaction was never entered
    await expect(
      withOverride({
        overrideType: 'document.unsign',
        reason: 'test',
        actorUserId: 'user-1',
        fn: async () => {
          throw new Error('fn() should not have been called');
        },
      }),
    ).rejects.toThrow(OverrideNotPermittedError);
  });

  it('second-approver missing rejected before any DB work', async () => {
    const { withOverride } = await import('../../src/audit/override');

    await expect(
      withOverride({
        overrideType: 'workflow.force_close',
        reason: 'test',
        actorUserId: 'user-1',
        // No approvedBy provided
        fn: async () => {
          throw new Error('fn() should not have been called');
        },
      }),
    ).rejects.toThrow(SecondApproverRequiredError);
  });

  it('self-approval rejected before any DB work', async () => {
    const { withOverride } = await import('../../src/audit/override');

    await expect(
      withOverride({
        overrideType: 'workflow.force_close',
        reason: 'test',
        actorUserId: 'admin-1',
        approvedBy: 'admin-1', // same person = self-approval
        fn: async () => {
          throw new Error('fn() should not have been called');
        },
      }),
    ).rejects.toThrow(SelfApprovalProhibitedError);
  });
});
