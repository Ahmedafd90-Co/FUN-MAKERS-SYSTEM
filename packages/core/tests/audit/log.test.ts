import { describe, it, expect, beforeEach } from 'vitest';
import { auditService } from '../../src/audit/service';
import { prisma } from '@fmksa/db';

describe('auditService.log', () => {
  beforeEach(async () => {
    // Clean audit_logs before each test (use raw query since delete is
    // blocked by the no-delete-on-immutable middleware).
    await (prisma as any).$executeRaw`TRUNCATE TABLE audit_logs CASCADE`;
  });

  it('writes an audit log entry with all fields', async () => {
    const result = await auditService.log({
      actorUserId: 'user-1',
      actorSource: 'user',
      action: 'test.create',
      resourceType: 'test_resource',
      resourceId: 'res-1',
      projectId: 'proj-1',
      beforeJson: {},
      afterJson: { name: 'test' },
      reason: 'testing',
      ip: '127.0.0.1',
      userAgent: 'test-agent',
    });

    expect(result.id).toBeDefined();
    expect(result.action).toBe('test.create');
    expect(result.actorSource).toBe('user');
    expect(result.actorUserId).toBe('user-1');
    expect(result.resourceType).toBe('test_resource');
    expect(result.resourceId).toBe('res-1');
    expect(result.projectId).toBe('proj-1');
    expect(result.reason).toBe('testing');
    expect(result.ip).toBe('127.0.0.1');
    expect(result.userAgent).toBe('test-agent');
  });

  it('writes with system actorSource (no actorUserId required)', async () => {
    const result = await auditService.log({
      actorSource: 'system',
      action: 'system.boot',
      resourceType: 'system',
      resourceId: 'boot',
      beforeJson: {},
      afterJson: {},
    });

    expect(result.actorUserId).toBeNull();
    expect(result.actorSource).toBe('system');
  });

  it('writes with agent actorSource', async () => {
    const result = await auditService.log({
      actorSource: 'agent',
      action: 'agent.task',
      resourceType: 'task',
      resourceId: 'task-1',
      beforeJson: {},
      afterJson: { status: 'done' },
    });

    expect(result.actorSource).toBe('agent');
  });

  it('writes with job actorSource', async () => {
    const result = await auditService.log({
      actorSource: 'job',
      action: 'job.scheduled',
      resourceType: 'cron',
      resourceId: 'daily-cleanup',
      beforeJson: {},
      afterJson: {},
    });

    expect(result.actorSource).toBe('job');
  });

  it('throws if actorSource is "user" but actorUserId is missing', async () => {
    await expect(
      auditService.log({
        actorSource: 'user',
        action: 'test',
        resourceType: 'test',
        resourceId: 'x',
        beforeJson: {},
        afterJson: {},
      }),
    ).rejects.toThrow(/actorUserId is required/);
  });

  it('works inside a Prisma transaction', async () => {
    await (prisma as any).$transaction(async (tx: any) => {
      await auditService.log(
        {
          actorSource: 'system',
          action: 'tx.test',
          resourceType: 'test',
          resourceId: 'tx-1',
          beforeJson: {},
          afterJson: {},
        },
        tx,
      );
    });

    const logs = await (prisma as any).auditLog.findMany({
      where: { action: 'tx.test' },
    });
    expect(logs).toHaveLength(1);
    expect(logs[0].resourceId).toBe('tx-1');
  });

  it('audit log entries cannot be deleted via Prisma (immutability)', async () => {
    const log = await auditService.log({
      actorSource: 'system',
      action: 'immutability.test',
      resourceType: 'test',
      resourceId: 'x',
      beforeJson: {},
      afterJson: {},
    });

    await expect(
      (prisma as any).auditLog.delete({ where: { id: log.id } }),
    ).rejects.toThrow(/immutable/i);
  });
});
