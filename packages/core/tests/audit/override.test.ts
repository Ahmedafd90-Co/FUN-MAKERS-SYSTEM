import { describe, it, expect } from 'vitest';
import { prisma } from '@fmksa/db';
import {
  withOverride,
  OverrideNotPermittedError,
  SecondApproverRequiredError,
  SelfApprovalProhibitedError,
} from '../../src/audit/override';

// ---------------------------------------------------------------------------
// withOverride() integration tests
// ---------------------------------------------------------------------------

describe('withOverride', () => {
  const ts = Date.now();

  // NOTE: No truncation between tests. Each test uses unique reason strings
  // (suffixed with ts) to avoid collisions when test files run in parallel.

  it('allowed action executes successfully', async () => {
    const result = await withOverride({
      overrideType: 'user.unlock_account',
      reason: `unlock-success-${ts}`,
      actorUserId: 'admin-1',
      fn: async () => ({ unlocked: true }),
    });

    expect(result).toEqual({ unlocked: true });
  });

  it('never-overridable action is rejected', async () => {
    await expect(
      withOverride({
        overrideType: 'document.unsign',
        reason: 'Want to unsign',
        actorUserId: 'admin-1',
        fn: async () => 'should not execute',
      }),
    ).rejects.toThrow(OverrideNotPermittedError);
  });

  it('never-overridable: posting.reverse_silently is rejected', async () => {
    await expect(
      withOverride({
        overrideType: 'posting.reverse_silently',
        reason: 'Silent reversal attempt',
        actorUserId: 'admin-1',
        fn: async () => 'should not execute',
      }),
    ).rejects.toThrow(OverrideNotPermittedError);
  });

  it('never-overridable: document.delete is rejected', async () => {
    await expect(
      withOverride({
        overrideType: 'document.delete',
        reason: 'Want to delete',
        actorUserId: 'admin-1',
        fn: async () => 'should not execute',
      }),
    ).rejects.toThrow(OverrideNotPermittedError);
  });

  it('requires-second-approver action rejected without approvedBy', async () => {
    await expect(
      withOverride({
        overrideType: 'workflow.force_close',
        reason: 'Force close workflow',
        actorUserId: 'admin-1',
        fn: async () => 'should not execute',
      }),
    ).rejects.toThrow(SecondApproverRequiredError);
  });

  it('self-approval prohibited (actorUserId === approvedBy)', async () => {
    await expect(
      withOverride({
        overrideType: 'workflow.force_close',
        reason: 'Force close',
        actorUserId: 'admin-1',
        approvedBy: 'admin-1', // same person
        fn: async () => 'should not execute',
      }),
    ).rejects.toThrow(SelfApprovalProhibitedError);
  });

  it('second-approver action succeeds with valid approvedBy', async () => {
    const result = await withOverride({
      overrideType: 'workflow.force_close',
      reason: `second-approver-ok-${ts}`,
      actorUserId: 'admin-1',
      approvedBy: 'admin-2',
      fn: async () => ({ closed: true }),
    });

    expect(result).toEqual({ closed: true });
  });

  it('writes both audit_logs and override_logs', async () => {
    const uniqueReason = `audit-override-log-test-${ts}`;

    await withOverride({
      overrideType: 'user.unlock_account',
      reason: uniqueReason,
      actorUserId: 'admin-1',
      fn: async () => 'ok',
    });

    const auditLogs = await prisma.auditLog.findMany({
      where: {
        action: 'override.user.unlock_account',
        reason: uniqueReason,
      },
    });
    expect(auditLogs).toHaveLength(1);
    expect(auditLogs[0]!.actorUserId).toBe('admin-1');

    const overrideLogs = await prisma.overrideLog.findMany({
      where: {
        overrideType: 'user.unlock_account',
        reason: uniqueReason,
      },
    });
    expect(overrideLogs).toHaveLength(1);
    expect(overrideLogs[0]!.overriderUserId).toBe('admin-1');
  });

  it('override log references the audit log entry', async () => {
    const uniqueReason = `ref-check-${ts}`;

    await withOverride({
      overrideType: 'workflow.reassign_approver',
      reason: uniqueReason,
      actorUserId: 'admin-1',
      fn: async () => 'ok',
    });

    const auditLog = await prisma.auditLog.findFirst({
      where: {
        action: 'override.workflow.reassign_approver',
        reason: uniqueReason,
      },
    });
    expect(auditLog).toBeTruthy();

    const overrideLog = await prisma.overrideLog.findFirst({
      where: {
        overrideType: 'workflow.reassign_approver',
        reason: uniqueReason,
      },
    });
    expect(overrideLog).toBeTruthy();
    expect(overrideLog!.auditLogId).toBe(auditLog!.id);
  });

  it('second-approver action with project_assignment.revoke_immediately', async () => {
    const uniqueReason = `revoke-immediate-${ts}`;

    const result = await withOverride({
      overrideType: 'project_assignment.revoke_immediately',
      reason: uniqueReason,
      actorUserId: 'admin-1',
      approvedBy: 'admin-2',
      fn: async () => ({ revoked: true }),
    });

    expect(result).toEqual({ revoked: true });

    const overrideLogs = await prisma.overrideLog.findMany({
      where: {
        overrideType: 'project_assignment.revoke_immediately',
        reason: uniqueReason,
      },
    });
    expect(overrideLogs).toHaveLength(1);
    expect(overrideLogs[0]!.approvedBy).toBe('admin-2');
  });
});
