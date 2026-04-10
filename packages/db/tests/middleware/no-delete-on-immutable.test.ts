import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '../../src/client';
import {
  cleanTestData,
  createTestDocumentWithVersion,
  createTestEntity,
  createTestProject,
  createTestUser,
} from '../helpers/test-data';

describe('no-delete-on-immutable', () => {
  let userId: string;
  let projectId: string;
  let entityId: string;

  beforeAll(async () => {
    await cleanTestData();
    const user = await createTestUser();
    userId = user.id;
    const entity = await createTestEntity();
    entityId = entity.id;
    const project = await createTestProject(entity.id);
    projectId = project.id;
  });

  afterAll(async () => {
    await cleanTestData();
  });

  // ---------- AuditLog ----------
  describe('AuditLog', () => {
    it('rejects delete', async () => {
      const log = await prisma.auditLog.create({
        data: {
          actorSource: 'system',
          action: 'test.delete-check',
          resourceType: 'test',
          resourceId: 'x',
          beforeJson: {},
          afterJson: {},
        },
      });
      await expect(
        prisma.auditLog.delete({ where: { id: log.id } }),
      ).rejects.toThrow(/immutable.*AuditLog/i);
    });

    it('rejects deleteMany', async () => {
      await expect(
        prisma.auditLog.deleteMany({ where: { action: 'test.delete-check' } }),
      ).rejects.toThrow(/immutable.*AuditLog/i);
    });
  });

  // ---------- OverrideLog ----------
  describe('OverrideLog', () => {
    it('rejects delete', async () => {
      // Need an AuditLog entry first for FK
      const auditLog = await prisma.auditLog.create({
        data: {
          actorSource: 'system',
          action: 'override.test',
          resourceType: 'test',
          resourceId: 'x',
          beforeJson: {},
          afterJson: {},
        },
      });
      const override = await prisma.overrideLog.create({
        data: {
          auditLogId: auditLog.id,
          overrideType: 'test',
          overriderUserId: userId,
          reason: 'test reason',
          beforeJson: {},
          afterJson: {},
        },
      });
      await expect(
        prisma.overrideLog.delete({ where: { id: override.id } }),
      ).rejects.toThrow(/immutable.*OverrideLog/i);
    });

    it('rejects deleteMany', async () => {
      await expect(
        prisma.overrideLog.deleteMany({ where: { overrideType: 'test' } }),
      ).rejects.toThrow(/immutable.*OverrideLog/i);
    });
  });

  // ---------- WorkflowAction ----------
  describe('WorkflowAction', () => {
    it('rejects delete', async () => {
      // Set up workflow template -> step -> instance -> action chain
      const template = await prisma.workflowTemplate.create({
        data: {
          code: `WF-${Date.now()}`,
          name: 'Test WF',
          recordType: 'test',
          version: 1,
          configJson: {},
          createdBy: userId,
        },
      });
      const step = await prisma.workflowStep.create({
        data: {
          templateId: template.id,
          orderIndex: 1,
          name: 'Step 1',
          approverRuleJson: {},
        },
      });
      const instance = await prisma.workflowInstance.create({
        data: {
          templateId: template.id,
          recordType: 'test',
          recordId: 'test-rec',
          projectId,
          status: 'in_progress',
          startedBy: userId,
          startedAt: new Date(),
        },
      });
      const action = await prisma.workflowAction.create({
        data: {
          instanceId: instance.id,
          stepId: step.id,
          actorUserId: userId,
          action: 'approve',
          actedAt: new Date(),
        },
      });

      await expect(
        prisma.workflowAction.delete({ where: { id: action.id } }),
      ).rejects.toThrow(/immutable.*WorkflowAction/i);
    });

    it('rejects deleteMany', async () => {
      await expect(
        prisma.workflowAction.deleteMany({ where: { action: 'approve' } }),
      ).rejects.toThrow(/immutable.*WorkflowAction/i);
    });
  });

  // ---------- PostingEvent ----------
  describe('PostingEvent', () => {
    it('rejects delete', async () => {
      const event = await prisma.postingEvent.create({
        data: {
          eventType: 'test',
          sourceService: 'test',
          sourceRecordType: 'test',
          sourceRecordId: 'x',
          projectId,
          idempotencyKey: `idem-${Date.now()}-${Math.random().toString(36).slice(2)}`,
          payloadJson: {},
          status: 'pending',
        },
      });
      await expect(
        prisma.postingEvent.delete({ where: { id: event.id } }),
      ).rejects.toThrow(/immutable.*PostingEvent/i);
    });

    it('rejects deleteMany', async () => {
      await expect(
        prisma.postingEvent.deleteMany({ where: { eventType: 'test' } }),
      ).rejects.toThrow(/immutable.*PostingEvent/i);
    });
  });

  // ---------- DocumentSignature ----------
  describe('DocumentSignature', () => {
    it('rejects delete', async () => {
      const { version } = await createTestDocumentWithVersion(
        projectId,
        userId,
        true,
      );
      const sig = await prisma.documentSignature.create({
        data: {
          versionId: version.id,
          signerUserId: userId,
          signatureType: 'internal_hash',
          signedAt: new Date(),
          ip: '127.0.0.1',
          userAgent: 'test-agent',
          hashAtSign: 'sha256-test-hash-at-sign',
        },
      });
      await expect(
        prisma.documentSignature.delete({ where: { id: sig.id } }),
      ).rejects.toThrow(/immutable.*DocumentSignature/i);
    });

    it('rejects deleteMany', async () => {
      await expect(
        prisma.documentSignature.deleteMany({
          where: { signatureType: 'internal_hash' },
        }),
      ).rejects.toThrow(/immutable.*DocumentSignature/i);
    });
  });

  // ---------- Non-immutable table should still allow delete ----------
  describe('non-immutable table (Entity)', () => {
    it('allows delete on a non-immutable table', async () => {
      const entity = await createTestEntity();
      const deleted = await prisma.entity.delete({
        where: { id: entity.id },
      });
      expect(deleted.id).toBe(entity.id);
    });
  });
});
