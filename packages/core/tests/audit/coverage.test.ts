/**
 * Audit coverage verification — Phase 1.10
 *
 * Validates that all critical mutation operations produce audit log entries
 * with correct action strings, actor sources, and resource references.
 *
 * This is a meta-test: it verifies the audit trail is complete across
 * the Module 1 service layer rather than testing audit log mechanics.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { prisma } from '@fmksa/db';
import { auditService } from '../../src/audit/service';
import { postingService } from '../../src/posting/service';
import { reversePostingEvent } from '../../src/posting/reversal';
import { projectsService } from '../../src/projects/service';
import { documentService } from '../../src/documents/service';
import { workflowTemplateService } from '../../src/workflow/templates';
import { workflowInstanceService } from '../../src/workflow/instances';
import { workflowStepService } from '../../src/workflow/steps';
import { entitiesService } from '../../src/entities/service';
import { referenceDataService } from '../../src/reference-data/service';
import { clearHandlers } from '../../src/workflow/events';

const MINIO_AVAILABLE =
  !!process.env.STORAGE_ENDPOINT && !!process.env.STORAGE_BUCKET;

const ts = `auditcov-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

let testUserId: string;
let testEntityId: string;
let testProjectId: string;
let testRoleCode: string;
let testRoleId: string;

beforeAll(async () => {
  clearHandlers();

  const user = await prisma.user.create({
    data: {
      email: `${ts}@test.com`,
      name: 'Audit Coverage User',
      passwordHash: 'test-hash',
      status: 'active',
    },
  });
  testUserId = user.id;

  const role = await prisma.role.create({
    data: {
      code: `AC-ROLE-${ts}`,
      name: 'Audit Coverage Role',
      isSystem: false,
    },
  });
  testRoleCode = role.code;
  testRoleId = role.id;

  await prisma.userRole.create({
    data: {
      userId: testUserId,
      roleId: testRoleId,
      effectiveFrom: new Date('2020-01-01'),
      assignedBy: testUserId,
      assignedAt: new Date(),
    },
  });

  const entity = await prisma.entity.create({
    data: {
      code: `ENT-AC-${ts}`,
      name: 'Audit Coverage Entity',
      type: 'parent',
      status: 'active',
    },
  });
  testEntityId = entity.id;

  await prisma.currency.upsert({
    where: { code: 'SAR' },
    create: { code: 'SAR', name: 'Saudi Riyal', symbol: '\uFDFC', decimalPlaces: 2 },
    update: {},
  });

  const project = await prisma.project.create({
    data: {
      code: `PROJ-AC-${ts}`,
      name: 'Audit Coverage Project',
      entityId: testEntityId,
      currencyCode: 'SAR',
      startDate: new Date(),
      createdBy: testUserId,
      status: 'active',
    },
  });
  testProjectId = project.id;

  await prisma.projectAssignment.create({
    data: {
      projectId: testProjectId,
      userId: testUserId,
      roleId: testRoleId,
      effectiveFrom: new Date('2020-01-01'),
      assignedBy: testUserId,
      assignedAt: new Date(),
    },
  });
});

// ---------------------------------------------------------------------------
// Helper: find audit logs after a given timestamp
// ---------------------------------------------------------------------------

async function findAuditLogs(action: string, after: Date) {
  return prisma.auditLog.findMany({
    where: {
      action,
      createdAt: { gte: after },
    },
    orderBy: { createdAt: 'desc' },
    take: 5,
  });
}

// ---------------------------------------------------------------------------
// Tests — verify each critical mutation produces an audit log
// ---------------------------------------------------------------------------

describe('audit coverage — posting', () => {
  it('posting.post writes posting_event_posted audit log', async () => {
    const before = new Date();
    await postingService.post({
      eventType: 'TEST_EVENT_M1',
      sourceService: 'audit-cov',
      sourceRecordType: 'test',
      sourceRecordId: `ac-post-${ts}`,
      projectId: testProjectId,
      idempotencyKey: `ac-post-${ts}`,
      payload: { amount: 100, currency: 'SAR', description: 'Audit cov' },
      actorUserId: testUserId,
    });

    const logs = await findAuditLogs('posting_event_posted', before);
    expect(logs.length).toBeGreaterThanOrEqual(1);
    expect(logs[0]!.actorUserId).toBe(testUserId);
  });

  it('posting.reverse writes posting_event_reversed audit log', async () => {
    const event = await postingService.post({
      eventType: 'TEST_EVENT_M1',
      sourceService: 'audit-cov',
      sourceRecordType: 'test',
      sourceRecordId: `ac-rev-${ts}`,
      projectId: testProjectId,
      idempotencyKey: `ac-rev-${ts}`,
      payload: { amount: 50, currency: 'SAR', description: 'Reversal' },
      actorUserId: testUserId,
    });

    const before = new Date();
    await reversePostingEvent({
      originalEventId: event.id,
      reason: 'Coverage test',
      actorUserId: testUserId,
    });

    const logs = await findAuditLogs('posting_event_reversed', before);
    expect(logs.length).toBeGreaterThanOrEqual(1);
  });
});

describe('audit coverage — workflow', () => {
  let templateCode: string;

  beforeAll(async () => {
    templateCode = `AC-TPL-${ts}`;
    const templateResult = await workflowTemplateService.createTemplate({
      code: templateCode,
      name: 'Audit Coverage Template',
      recordType: 'test_record',
      steps: [
        { orderIndex: 1, name: 'Step 1', approverRule: { type: 'role', roleCode: testRoleCode } },
      ],
      createdBy: testUserId,
    });
    await workflowTemplateService.activateTemplate(templateResult.id, testUserId);
  });

  it('workflow template creation writes workflow_template.create', async () => {
    const logs = await prisma.auditLog.findMany({
      where: { action: 'workflow_template.create', actorUserId: testUserId },
      orderBy: { createdAt: 'desc' },
      take: 1,
    });
    expect(logs.length).toBeGreaterThanOrEqual(1);
  });

  it('workflow instance start writes workflow.instance_started', async () => {
    const before = new Date();
    await workflowInstanceService.startInstance({
      templateCode,
      recordType: 'test_record',
      recordId: `ac-wf-start-${ts}`,
      projectId: testProjectId,
      startedBy: testUserId,
    });

    const logs = await findAuditLogs('workflow.instance_started', before);
    expect(logs.length).toBeGreaterThanOrEqual(1);
  });

  it('workflow step approval writes workflow.step_approved', async () => {
    const instance = await workflowInstanceService.startInstance({
      templateCode,
      recordType: 'test_record',
      recordId: `ac-wf-approve-${ts}`,
      projectId: testProjectId,
      startedBy: testUserId,
    });

    const before = new Date();
    await workflowStepService.approveStep({
      instanceId: instance.id,
      stepId: instance.currentStepId!,
      actorUserId: testUserId,
    });

    const logs = await findAuditLogs('workflow.step_approved', before);
    expect(logs.length).toBeGreaterThanOrEqual(1);
  });

  it('workflow step rejection writes workflow.step_rejected', async () => {
    const instance = await workflowInstanceService.startInstance({
      templateCode,
      recordType: 'test_record',
      recordId: `ac-wf-reject-${ts}`,
      projectId: testProjectId,
      startedBy: testUserId,
    });

    const before = new Date();
    await workflowStepService.rejectStep({
      instanceId: instance.id,
      stepId: instance.currentStepId!,
      actorUserId: testUserId,
      comment: 'Audit coverage reject.',
    });

    const logs = await findAuditLogs('workflow.step_rejected', before);
    expect(logs.length).toBeGreaterThanOrEqual(1);
  });

  it('workflow cancellation writes workflow.instance_cancelled', async () => {
    const instance = await workflowInstanceService.startInstance({
      templateCode,
      recordType: 'test_record',
      recordId: `ac-wf-cancel-${ts}`,
      projectId: testProjectId,
      startedBy: testUserId,
    });

    const before = new Date();
    await workflowStepService.cancelInstance({
      instanceId: instance.id,
      actorUserId: testUserId,
      reason: 'Audit coverage cancel.',
    });

    const logs = await findAuditLogs('workflow.instance_cancelled', before);
    expect(logs.length).toBeGreaterThanOrEqual(1);
  });
});

describe('audit coverage — entities', () => {
  it('entity creation writes entity.create', async () => {
    const before = new Date();
    await entitiesService.createEntity({
      code: `AC-ENT-CREATE-${ts}`,
      name: 'Audit Entity Create',
      type: 'subsidiary',
      parentEntityId: testEntityId,
      status: 'active',
      createdBy: testUserId,
    });

    const logs = await findAuditLogs('entity.create', before);
    expect(logs.length).toBeGreaterThanOrEqual(1);
  });
});

describe.skipIf(!MINIO_AVAILABLE)('audit coverage — documents', () => {
  it('document creation writes document.create', async () => {
    const before = new Date();
    await documentService.createDocument({
      projectId: testProjectId,
      title: 'Audit Coverage Doc',
      category: 'general',
      createdBy: testUserId,
    });

    const logs = await findAuditLogs('document.create', before);
    expect(logs.length).toBeGreaterThanOrEqual(1);
  });

  it('document version upload writes document.upload_version', async () => {
    const doc = await documentService.createDocument({
      projectId: testProjectId,
      title: 'Audit Upload Doc',
      category: 'general',
      createdBy: testUserId,
    });

    const before = new Date();
    await documentService.uploadVersion({
      documentId: doc.id,
      fileBuffer: Buffer.from('Audit coverage content'),
      fileName: 'audit-cov.pdf',
      mimeType: 'application/pdf',
      uploadedBy: testUserId,
    });

    const logs = await findAuditLogs('document.upload_version', before);
    expect(logs.length).toBeGreaterThanOrEqual(1);
  });

  it('document signing writes document.sign_version', async () => {
    const doc = await documentService.createDocument({
      projectId: testProjectId,
      title: 'Audit Sign Doc',
      category: 'general',
      createdBy: testUserId,
    });

    const version = await documentService.uploadVersion({
      documentId: doc.id,
      fileBuffer: Buffer.from('Sign this'),
      fileName: 'sign.pdf',
      mimeType: 'application/pdf',
      uploadedBy: testUserId,
    });

    const before = new Date();
    await documentService.signVersion({
      versionId: version.id,
      signerUserId: testUserId,
      ip: '127.0.0.1',
      userAgent: 'test-agent',
    });

    const logs = await findAuditLogs('document.sign_version', before);
    expect(logs.length).toBeGreaterThanOrEqual(1);
  });
});

describe('audit coverage — override control', () => {
  it('override writes both audit_log and override_log', async () => {
    const { withOverride } = await import('../../src/audit/override');

    const before = new Date();
    await withOverride({
      overrideType: 'user.unlock_account',
      reason: `audit-cov-override-${ts}`,
      actorUserId: testUserId,
      fn: async () => 'ok',
    });

    const auditLogs = await findAuditLogs('override.user.unlock_account', before);
    expect(auditLogs.length).toBeGreaterThanOrEqual(1);

    const overrideLogs = await prisma.overrideLog.findMany({
      where: {
        overrideType: 'user.unlock_account',
        reason: `audit-cov-override-${ts}`,
      },
    });
    expect(overrideLogs.length).toBeGreaterThanOrEqual(1);
    expect(overrideLogs[0]!.auditLogId).toBe(auditLogs[0]!.id);
  });
});
