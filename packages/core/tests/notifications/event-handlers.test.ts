/**
 * Tests for notification event handlers — Task 1.8.6
 *
 * Verifies that workflow events and posting exceptions trigger
 * the correct notifications to the correct recipients.
 *
 * Requires: Postgres running (DATABASE_URL)
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { prisma } from '@fmksa/db';
import * as workflowEvents from '../../src/workflow/events';
import {
  registerWorkflowNotificationHandlers,
  notifyPostingException,
} from '../../src/notifications/event-handlers';

const ts = `eh-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

// Test data holders
let starterUser: { id: string };
let approverUser: { id: string };
let adminUser: { id: string };
let entity: { id: string };
let project: { id: string };
let template: { id: string };
let step1: { id: string; name: string };
let step2: { id: string; name: string };
let instance: { id: string };
let adminRoleId: string;

beforeAll(async () => {
  // Create test users
  [starterUser, approverUser, adminUser] = await Promise.all([
    prisma.user.create({
      data: {
        email: `starter-${ts}@test.com`,
        name: 'Workflow Starter',
        passwordHash: 'hash',
        status: 'active',
      },
    }),
    prisma.user.create({
      data: {
        email: `approver-${ts}@test.com`,
        name: 'Step Approver',
        passwordHash: 'hash',
        status: 'active',
      },
    }),
    prisma.user.create({
      data: {
        email: `admin-${ts}@test.com`,
        name: 'Master Admin',
        passwordHash: 'hash',
        status: 'active',
      },
    }),
  ]);

  // Create entity and project
  entity = await prisma.entity.create({
    data: { name: `Entity ${ts}`, code: `ENT-${ts}`, type: 'parent', status: 'active' },
  });

  project = await prisma.project.create({
    data: {
      name: `Project ${ts}`,
      code: `PRJ-${ts}`,
      entityId: entity.id,
      status: 'active',
      currencyCode: 'SAR',
      startDate: new Date('2026-01-01'),
      createdBy: starterUser.id,
    },
  });

  // Create a role for the approver
  const approverRole = await prisma.role.create({
    data: {
      name: `Doc Controller ${ts}`,
      code: `document_controller_${ts}`,
      description: 'Test role',
      isSystem: false,
    },
  });

  // Assign role to approverUser
  await prisma.userRole.create({
    data: {
      userId: approverUser.id,
      roleId: approverRole.id,
      effectiveFrom: new Date('2020-01-01'),
      assignedBy: starterUser.id,
      assignedAt: new Date(),
    },
  });

  // Assign approver to project
  await (prisma as any).projectAssignment.create({
    data: {
      userId: approverUser.id,
      projectId: project.id,
      roleId: approverRole.id,
      assignedBy: starterUser.id,
      effectiveFrom: new Date('2020-01-01'),
      assignedAt: new Date(),
    },
  });

  // Create master_admin role + assignment for posting exception test
  const existingMasterAdmin = await prisma.role.findFirst({
    where: { code: 'master_admin' },
  });
  adminRoleId = existingMasterAdmin?.id ?? '';
  if (existingMasterAdmin) {
    await prisma.userRole.create({
      data: {
        userId: adminUser.id,
        roleId: existingMasterAdmin.id,
        effectiveFrom: new Date('2020-01-01'),
        assignedBy: starterUser.id,
        assignedAt: new Date(),
      },
    });
  }

  // Create workflow template + steps
  template = await prisma.workflowTemplate.create({
    data: {
      code: `wf-${ts}`,
      name: `Test WF ${ts}`,
      recordType: 'document',
      version: 1,
      isActive: true,
      configJson: {},
      createdBy: 'system',
    },
  });

  step1 = await prisma.workflowStep.create({
    data: {
      templateId: template.id,
      orderIndex: 10,
      name: 'Step 1 Review',
      approverRuleJson: { type: 'user', userId: approverUser.id },
      slaHours: 24,
      isOptional: false,
      requirementFlagsJson: {},
    },
  });

  step2 = await prisma.workflowStep.create({
    data: {
      templateId: template.id,
      orderIndex: 20,
      name: 'Step 2 Approval',
      approverRuleJson: { type: 'user', userId: approverUser.id },
      slaHours: 48,
      isOptional: false,
      requirementFlagsJson: {},
    },
  });

  // Create workflow instance pointing at step2 (simulating step1 just approved)
  instance = await (prisma as any).workflowInstance.create({
    data: {
      templateId: template.id,
      recordType: 'document',
      recordId: 'doc-123',
      projectId: project.id,
      status: 'in_progress',
      startedBy: starterUser.id,
      startedAt: new Date(),
      currentStepId: step2.id,
    },
  });

  // Register handlers
  workflowEvents.clearHandlers();
  registerWorkflowNotificationHandlers();
});

afterAll(async () => {
  workflowEvents.clearHandlers();
});

// Helper: count notifications for a user with a given template
async function countNotifications(userId: string, templateCode: string) {
  return prisma.notification.count({
    where: { userId, templateCode },
  });
}

describe('workflow event handlers', () => {
  describe('workflow.stepApproved', () => {
    it('notifies next step approvers', async () => {
      const before = await countNotifications(approverUser.id, 'workflow_step_assigned');

      await workflowEvents.emit('workflow.stepApproved', {
        instanceId: instance.id,
        templateCode: `wf-${ts}`,
        recordType: 'document',
        recordId: 'doc-123',
        projectId: project.id,
        actorUserId: starterUser.id,
        stepName: step1.name,
      });

      const after = await countNotifications(approverUser.id, 'workflow_step_assigned');
      expect(after).toBeGreaterThan(before);
    });
  });

  describe('workflow.approved', () => {
    it('notifies the workflow starter', async () => {
      const before = await countNotifications(starterUser.id, 'workflow_approved');

      await workflowEvents.emit('workflow.approved', {
        instanceId: instance.id,
        templateCode: `wf-${ts}`,
        recordType: 'document',
        recordId: 'doc-123',
        projectId: project.id,
        actorUserId: approverUser.id,
      });

      const after = await countNotifications(starterUser.id, 'workflow_approved');
      expect(after).toBeGreaterThan(before);
    });
  });

  describe('workflow.rejected', () => {
    it('notifies the workflow starter', async () => {
      const before = await countNotifications(starterUser.id, 'workflow_rejected');

      await workflowEvents.emit('workflow.rejected', {
        instanceId: instance.id,
        templateCode: `wf-${ts}`,
        recordType: 'document',
        recordId: 'doc-123',
        projectId: project.id,
        actorUserId: approverUser.id,
        comment: 'Missing attachment',
      });

      const after = await countNotifications(starterUser.id, 'workflow_rejected');
      expect(after).toBeGreaterThan(before);
    });
  });

  describe('workflow.returned', () => {
    it('notifies the workflow starter and the actor', async () => {
      const beforeStarter = await countNotifications(starterUser.id, 'workflow_returned');
      const beforeActor = await countNotifications(approverUser.id, 'workflow_returned');

      await workflowEvents.emit('workflow.returned', {
        instanceId: instance.id,
        templateCode: `wf-${ts}`,
        recordType: 'document',
        recordId: 'doc-123',
        projectId: project.id,
        actorUserId: approverUser.id,
        comment: 'Needs revision',
      });

      const afterStarter = await countNotifications(starterUser.id, 'workflow_returned');
      const afterActor = await countNotifications(approverUser.id, 'workflow_returned');
      expect(afterStarter).toBeGreaterThan(beforeStarter);
      expect(afterActor).toBeGreaterThan(beforeActor);
    });
  });
});

describe('notifyPostingException', () => {
  it('notifies master_admin users when a posting exception occurs', async () => {
    if (!adminRoleId) {
      console.warn('Skipping: no master_admin role in seed data');
      return;
    }

    const before = await countNotifications(adminUser.id, 'posting_exception');

    await notifyPostingException(
      'JE_POSTING',
      `exception-${ts}`,
      project.id,
      'Amount mismatch',
    );

    const after = await countNotifications(adminUser.id, 'posting_exception');
    expect(after).toBeGreaterThan(before);
  });
});
