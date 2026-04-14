/**
 * Workflow full lifecycle E2E tests — Phase 1.10
 *
 * Tests complete multi-step workflow cycles end-to-end:
 *   - Start → approve all steps → workflow approved (terminal)
 *   - Start → approve → return → resubmit → approve all → approved
 *   - Start → reject at step N → workflow rejected (terminal)
 *   - Start → cancel → workflow cancelled (terminal)
 *   - Verify all actions are immutably recorded for each lifecycle
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { prisma } from '@fmksa/db';
import { workflowTemplateService } from '../../src/workflow/templates';
import { workflowInstanceService } from '../../src/workflow/instances';
import { workflowStepService } from '../../src/workflow/steps';
import { clearHandlers, on } from '../../src/workflow/events';

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

let testUser: { id: string };
let testRole: { id: string; code: string };
let testEntity: { id: string };
let testProject: { id: string };
let threeStepCode: string;
const ts = `lifecycle-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

beforeAll(async () => {
  testUser = await prisma.user.create({
    data: {
      email: `wf-lifecycle-${ts}@test.com`,
      name: 'Lifecycle Test User',
      passwordHash: 'test-hash',
      status: 'active',
    },
  });

  testRole = await prisma.role.create({
    data: {
      code: `LC-ROLE-${ts}`,
      name: 'Lifecycle Test Role',
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
      code: `ENT-LC-${ts}`,
      name: 'Lifecycle Test Entity',
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
      code: `PROJ-LC-${ts}`,
      name: 'Lifecycle Test Project',
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

  // 3-step template for lifecycle tests
  threeStepCode = `LC-3STEP-${ts}`;
  const templateResult = await workflowTemplateService.createTemplate({
    code: threeStepCode,
    name: 'Three Step Lifecycle',
    recordType: 'test_record',
    config: { allowComment: true, allowReturn: true, allowOverride: false },
    steps: [
      {
        orderIndex: 1,
        name: 'Review',
        approverRule: { type: 'role', roleCode: testRole.code },
        slaHours: 24,
      },
      {
        orderIndex: 2,
        name: 'Approve',
        approverRule: { type: 'role', roleCode: testRole.code },
        slaHours: 48,
      },
      {
        orderIndex: 3,
        name: 'Final Sign-off',
        approverRule: { type: 'role', roleCode: testRole.code },
        slaHours: 72,
      },
    ],
    createdBy: testUser.id,
  });
  await workflowTemplateService.activateTemplate(templateResult.id, testUser.id);
});

beforeEach(() => {
  clearHandlers();
});

afterAll(async () => {
  const ourTemplates = await prisma.workflowTemplate.findMany({
    where: { code: { contains: ts } },
    select: { id: true },
  });
  const templateIds = ourTemplates.map((t) => t.id);

  if (templateIds.length > 0) {
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
  await prisma.project.deleteMany({ where: { code: `PROJ-LC-${ts}` } });
  await prisma.entity.deleteMany({ where: { code: `ENT-LC-${ts}` } });
  await prisma.userRole.deleteMany({ where: { roleId: testRole.id } });
  await prisma.role.deleteMany({ where: { code: `LC-ROLE-${ts}` } });
  await prisma.user.deleteMany({ where: { email: `wf-lifecycle-${ts}@test.com` } });
});

let recordCounter = 0;
async function createInstance() {
  recordCounter++;
  return workflowInstanceService.startInstance({
    templateCode: threeStepCode,
    recordType: 'test_record',
    recordId: `lc-rec-${ts}-${recordCounter}`,
    projectId: testProject.id,
    startedBy: testUser.id,
  });
}

// ---------------------------------------------------------------------------
// Full lifecycle tests
// ---------------------------------------------------------------------------

describe('workflow full lifecycle', () => {
  it('start → approve all 3 steps → workflow approved', async () => {
    const events: string[] = [];
    on('workflow.stepApproved', async () => { events.push('stepApproved'); });
    on('workflow.approved', async () => { events.push('approved'); });

    const instance = await createInstance();
    expect(instance.status).toBe('in_progress');
    expect(instance.currentStep!.name).toBe('Review');

    // Step 1: Review
    const after1 = await workflowStepService.approveStep({
      instanceId: instance.id,
      stepId: instance.currentStepId!,
      actorUserId: testUser.id,
      comment: 'Reviewed OK',
    });
    expect(after1.status).toBe('in_progress');
    const refresh1 = await workflowInstanceService.getInstance(instance.id);
    expect(refresh1.currentStep!.name).toBe('Approve');

    // Step 2: Approve
    await workflowStepService.approveStep({
      instanceId: instance.id,
      stepId: refresh1.currentStepId!,
      actorUserId: testUser.id,
      comment: 'Approved',
    });
    const refresh2 = await workflowInstanceService.getInstance(instance.id);
    expect(refresh2.currentStep!.name).toBe('Final Sign-off');

    // Step 3: Final Sign-off
    const final = await workflowStepService.approveStep({
      instanceId: instance.id,
      stepId: refresh2.currentStepId!,
      actorUserId: testUser.id,
      comment: 'Signed off',
    });
    expect(final.status).toBe('approved');
    expect(final.completedAt).toBeDefined();
    expect(final.currentStepId).toBeNull();

    // Verify events
    expect(events).toEqual(['stepApproved', 'stepApproved', 'stepApproved', 'approved']);

    // Verify all actions are immutably recorded (started + 3 approvals)
    const allActions = await prisma.workflowAction.findMany({
      where: { instanceId: instance.id },
      orderBy: { actedAt: 'asc' },
    });
    expect(allActions.length).toBeGreaterThanOrEqual(4); // started + 3 approved
    expect(allActions[0]!.action).toBe('started');
    expect(allActions.filter((a) => a.action === 'approved')).toHaveLength(3);
  });

  it('start → approve step 1 → return to step 1 → resubmit → approve all → approved', async () => {
    const instance = await createInstance();

    // Approve step 1
    await workflowStepService.approveStep({
      instanceId: instance.id,
      stepId: instance.currentStepId!,
      actorUserId: testUser.id,
    });

    const atStep2 = await workflowInstanceService.getInstance(instance.id);
    expect(atStep2.currentStep!.name).toBe('Approve');

    // Return to step 1
    await workflowStepService.returnStep({
      instanceId: instance.id,
      stepId: atStep2.currentStepId!,
      actorUserId: testUser.id,
      comment: 'Needs revision on review.',
    });

    const returned = await workflowInstanceService.getInstance(instance.id);
    expect(returned.status).toBe('returned');
    expect(returned.currentStep!.name).toBe('Review');

    // Resubmit (approve step 1 again)
    await workflowStepService.approveStep({
      instanceId: instance.id,
      stepId: returned.currentStepId!,
      actorUserId: testUser.id,
      comment: 'Revised and resubmitted.',
    });

    const backAtStep2 = await workflowInstanceService.getInstance(instance.id);
    expect(backAtStep2.status).toBe('in_progress');
    expect(backAtStep2.currentStep!.name).toBe('Approve');

    // Approve step 2
    await workflowStepService.approveStep({
      instanceId: instance.id,
      stepId: backAtStep2.currentStepId!,
      actorUserId: testUser.id,
    });

    const atStep3 = await workflowInstanceService.getInstance(instance.id);
    expect(atStep3.currentStep!.name).toBe('Final Sign-off');

    // Approve step 3 — final
    const final = await workflowStepService.approveStep({
      instanceId: instance.id,
      stepId: atStep3.currentStepId!,
      actorUserId: testUser.id,
      comment: 'Final approval after revision.',
    });

    expect(final.status).toBe('approved');
    expect(final.completedAt).toBeDefined();

    // Verify action trail: started, approved, returned, approved (resubmit), approved, approved
    const actions = await prisma.workflowAction.findMany({
      where: { instanceId: instance.id },
      orderBy: { actedAt: 'asc' },
    });
    const actionTypes = actions.map((a) => a.action);
    expect(actionTypes[0]).toBe('started');
    expect(actionTypes).toContain('returned');
    expect(actionTypes.filter((a) => a === 'approved').length).toBeGreaterThanOrEqual(4);
  });

  it('start → reject at step 2 → workflow rejected (terminal)', async () => {
    const events: string[] = [];
    on('workflow.rejected', async () => { events.push('rejected'); });

    const instance = await createInstance();

    // Approve step 1
    await workflowStepService.approveStep({
      instanceId: instance.id,
      stepId: instance.currentStepId!,
      actorUserId: testUser.id,
    });

    const atStep2 = await workflowInstanceService.getInstance(instance.id);

    // Reject at step 2
    const rejected = await workflowStepService.rejectStep({
      instanceId: instance.id,
      stepId: atStep2.currentStepId!,
      actorUserId: testUser.id,
      comment: 'Does not meet quality standards.',
    });

    expect(rejected.status).toBe('rejected');
    expect(rejected.completedAt).toBeDefined();
    expect(events).toEqual(['rejected']);

    // Verify action trail
    const actions = await prisma.workflowAction.findMany({
      where: { instanceId: instance.id },
      orderBy: { actedAt: 'asc' },
    });
    const actionTypes = actions.map((a) => a.action);
    expect(actionTypes).toContain('started');
    expect(actionTypes).toContain('approved');
    expect(actionTypes).toContain('rejected');
  });

  it('start → cancel mid-workflow → workflow cancelled (terminal)', async () => {
    const events: string[] = [];
    on('workflow.cancelled', async () => { events.push('cancelled'); });

    const instance = await createInstance();

    // Approve step 1
    await workflowStepService.approveStep({
      instanceId: instance.id,
      stepId: instance.currentStepId!,
      actorUserId: testUser.id,
    });

    // Cancel at step 2
    const cancelled = await workflowStepService.cancelInstance({
      instanceId: instance.id,
      actorUserId: testUser.id,
      reason: 'Project scope changed.',
    });

    expect(cancelled.status).toBe('cancelled');
    expect(cancelled.completedAt).toBeDefined();
    expect(events).toEqual(['cancelled']);
  });

  it('terminal states are truly terminal — cannot approve/reject/return', async () => {
    const instance = await createInstance();

    // Reject to reach terminal state
    await workflowStepService.rejectStep({
      instanceId: instance.id,
      stepId: instance.currentStepId!,
      actorUserId: testUser.id,
      comment: 'Rejected.',
    });

    const rejected = await workflowInstanceService.getInstance(instance.id);
    expect(rejected.status).toBe('rejected');

    // Trying to approve on a rejected instance should fail
    await expect(
      workflowStepService.approveStep({
        instanceId: instance.id,
        stepId: instance.currentStepId!,
        actorUserId: testUser.id,
      }),
    ).rejects.toThrow();
  });

  it('audit logs are written for each action in the lifecycle', async () => {
    const instance = await createInstance();

    // Complete the workflow
    await workflowStepService.approveStep({
      instanceId: instance.id,
      stepId: instance.currentStepId!,
      actorUserId: testUser.id,
    });
    const r1 = await workflowInstanceService.getInstance(instance.id);

    await workflowStepService.approveStep({
      instanceId: instance.id,
      stepId: r1.currentStepId!,
      actorUserId: testUser.id,
    });
    const r2 = await workflowInstanceService.getInstance(instance.id);

    await workflowStepService.approveStep({
      instanceId: instance.id,
      stepId: r2.currentStepId!,
      actorUserId: testUser.id,
    });

    // Check audit logs for this workflow instance
    const auditLogs = await prisma.auditLog.findMany({
      where: { resourceId: instance.id },
      orderBy: { createdAt: 'asc' },
    });

    // Should have at least: started + 3 step_approved + workflow approved
    expect(auditLogs.length).toBeGreaterThanOrEqual(4);
    const actions = auditLogs.map((l) => l.action);
    expect(actions.filter((a) => a.includes('approved')).length).toBeGreaterThanOrEqual(3);
  });
});
