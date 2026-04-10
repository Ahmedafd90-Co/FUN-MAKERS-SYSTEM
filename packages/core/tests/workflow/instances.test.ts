import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { prisma } from '@fmksa/db';
import { workflowTemplateService } from '../../src/workflow/templates';
import {
  workflowInstanceService,
  DuplicateInstanceError,
  TemplateNotActiveError,
  ProjectNotFoundError,
} from '../../src/workflow/instances';
import { clearHandlers } from '../../src/workflow/events';

// ---------------------------------------------------------------------------
// Test fixtures — unique per test run to avoid cross-file interference
// ---------------------------------------------------------------------------

let testUser: { id: string };
let testRole: { id: string; code: string };
let testEntity: { id: string };
let testProject: { id: string };
let templateCode: string;
const ts = `inst-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

beforeAll(async () => {
  testUser = await prisma.user.create({
    data: {
      email: `wf-inst-${ts}@test.com`,
      name: 'Instance Test User',
      passwordHash: 'test-hash',
      status: 'active',
    },
  });

  testRole = await prisma.role.create({
    data: {
      code: `INST-ROLE-${ts}`,
      name: 'Instance Test Role',
      isSystem: false,
    },
  });

  await prisma.userRole.create({
    data: {
      userId: testUser.id,
      roleId: testRole.id,
      effectiveFrom: new Date('2020-01-01'),
      assignedBy: testUser.id,
      assignedAt: new Date(),
    },
  });

  testEntity = await prisma.entity.create({
    data: {
      code: `ENT-INST-${ts}`,
      name: 'Instance Test Entity',
      type: 'parent',
      status: 'active',
    },
  });

  await prisma.currency.upsert({
    where: { code: 'SAR' },
    create: { code: 'SAR', name: 'Saudi Riyal', symbol: '\uFDFC', decimalPlaces: 2 },
    update: {},
  });

  testProject = await prisma.project.create({
    data: {
      code: `PROJ-INST-${ts}`,
      name: 'Instance Test Project',
      entityId: testEntity.id,
      currencyCode: 'SAR',
      startDate: new Date(),
      createdBy: testUser.id,
      status: 'active',
    },
  });

  await prisma.projectAssignment.create({
    data: {
      projectId: testProject.id,
      userId: testUser.id,
      roleId: testRole.id,
      effectiveFrom: new Date('2020-01-01'),
      assignedBy: testUser.id,
      assignedAt: new Date(),
    },
  });

  // Create a template
  templateCode = `INST-TPL-${ts}`;
  await workflowTemplateService.createTemplate({
    code: templateCode,
    name: 'Instance Test Template',
    recordType: 'test_record',
    config: { allowComment: true, allowReturn: true, allowOverride: false },
    steps: [
      {
        orderIndex: 1,
        name: 'Step 1 - Review',
        approverRule: { type: 'role', roleCode: testRole.code },
        slaHours: 24,
      },
      {
        orderIndex: 2,
        name: 'Step 2 - Approve',
        approverRule: { type: 'role', roleCode: testRole.code },
        slaHours: 48,
      },
    ],
    createdBy: testUser.id,
  });
});

beforeEach(() => {
  clearHandlers();
});

afterAll(async () => {
  // Clean only our own data in dependency order
  const ourTemplates = await prisma.workflowTemplate.findMany({
    where: { code: { contains: ts } },
    select: { id: true },
  });
  const templateIds = ourTemplates.map((t) => t.id);

  if (templateIds.length > 0) {
    // WorkflowAction is immutable — use raw SQL for cleanup
    for (const tid of templateIds) {
      await (prisma as any).$executeRawUnsafe(
        `DELETE FROM workflow_actions WHERE instance_id IN (SELECT id FROM workflow_instances WHERE template_id = '${tid}')`,
      );
    }
    await prisma.workflowInstance.deleteMany({
      where: { templateId: { in: templateIds } },
    });
    await prisma.workflowStep.deleteMany({
      where: { templateId: { in: templateIds } },
    });
    await prisma.workflowTemplate.deleteMany({
      where: { id: { in: templateIds } },
    });
  }

  await prisma.projectAssignment.deleteMany({
    where: { projectId: testProject.id },
  });
  await prisma.project.deleteMany({ where: { code: `PROJ-INST-${ts}` } });
  await prisma.entity.deleteMany({ where: { code: `ENT-INST-${ts}` } });
  await prisma.userRole.deleteMany({ where: { roleId: testRole.id } });
  await prisma.role.deleteMany({ where: { code: `INST-ROLE-${ts}` } });
  await prisma.user.deleteMany({ where: { email: `wf-inst-${ts}@test.com` } });
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('workflowInstanceService', () => {
  describe('startInstance', () => {
    it('creates a workflow instance with status in_progress', async () => {
      const instance = await workflowInstanceService.startInstance({
        templateCode,
        recordType: 'test_record',
        recordId: `rec-${ts}-1`,
        projectId: testProject.id,
        startedBy: testUser.id,
      });

      expect(instance.id).toBeDefined();
      expect(instance.status).toBe('in_progress');
      expect(instance.recordType).toBe('test_record');
      expect(instance.recordId).toBe(`rec-${ts}-1`);
      expect(instance.currentStep).toBeDefined();
      expect(instance.currentStep!.name).toBe('Step 1 - Review');
    });

    it('writes a started action', async () => {
      const instance = await workflowInstanceService.startInstance({
        templateCode,
        recordType: 'test_record',
        recordId: `rec-${ts}-action`,
        projectId: testProject.id,
        startedBy: testUser.id,
      });

      expect(instance.actions.length).toBeGreaterThanOrEqual(1);
      const startAction = instance.actions.find((a) => a.action === 'started');
      expect(startAction).toBeDefined();
    });

    it('prevents duplicate in-progress instances for the same record', async () => {
      const recordId = `rec-${ts}-dup`;

      await workflowInstanceService.startInstance({
        templateCode,
        recordType: 'test_record',
        recordId,
        projectId: testProject.id,
        startedBy: testUser.id,
      });

      await expect(
        workflowInstanceService.startInstance({
          templateCode,
          recordType: 'test_record',
          recordId,
          projectId: testProject.id,
          startedBy: testUser.id,
        }),
      ).rejects.toThrow(DuplicateInstanceError);
    });

    it('throws TemplateNotActiveError for non-existent template code', async () => {
      await expect(
        workflowInstanceService.startInstance({
          templateCode: 'NONEXISTENT-CODE',
          recordType: 'test_record',
          recordId: `rec-${ts}-notempl`,
          projectId: testProject.id,
          startedBy: testUser.id,
        }),
      ).rejects.toThrow(TemplateNotActiveError);
    });

    it('throws ProjectNotFoundError for non-existent project', async () => {
      await expect(
        workflowInstanceService.startInstance({
          templateCode,
          recordType: 'test_record',
          recordId: `rec-${ts}-noproj`,
          projectId: '00000000-0000-0000-0000-000000000000',
          startedBy: testUser.id,
        }),
      ).rejects.toThrow(ProjectNotFoundError);
    });
  });

  describe('getInstance with SLA (Task 1.5.7)', () => {
    it('returns SLA info for the current step', async () => {
      const instance = await workflowInstanceService.startInstance({
        templateCode,
        recordType: 'test_record',
        recordId: `rec-${ts}-sla`,
        projectId: testProject.id,
        startedBy: testUser.id,
      });

      expect(instance.slaInfo).toBeDefined();
      expect(instance.slaInfo!.currentStepSlaHours).toBe(24);
      expect(instance.slaInfo!.currentStepStartedAt).toBeInstanceOf(Date);
      expect(typeof instance.slaInfo!.hoursElapsed).toBe('number');
      expect(instance.slaInfo!.hoursRemaining).toBeDefined();
      expect(instance.slaInfo!.isBreached).toBe(false);
    });

    it('returns null SLA info for completed instances', async () => {
      // Create a single-step template for this test
      const singleCode = `SLA-SINGLE-${ts}`;
      await workflowTemplateService.createTemplate({
        code: singleCode,
        name: 'Single Step',
        recordType: 'test_record',
        steps: [
          {
            orderIndex: 1,
            name: 'Only Step',
            approverRule: { type: 'role', roleCode: testRole.code },
            slaHours: 8,
          },
        ],
        createdBy: testUser.id,
      });

      const instance = await workflowInstanceService.startInstance({
        templateCode: singleCode,
        recordType: 'test_record',
        recordId: `rec-${ts}-sla-done`,
        projectId: testProject.id,
        startedBy: testUser.id,
      });

      // Approve to complete
      const { workflowStepService } = await import('../../src/workflow/steps');
      await workflowStepService.approveStep({
        instanceId: instance.id,
        stepId: instance.currentStepId!,
        actorUserId: testUser.id,
      });

      const completed = await workflowInstanceService.getInstance(instance.id);
      expect(completed.status).toBe('approved');
      expect(completed.slaInfo).toBeNull();
    });
  });
});
