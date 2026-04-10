/**
 * Integration tests for the notification system — Tasks 1.8.11, 1.8.12, 1.8.13
 *
 * 1.8.11  Notification lifecycle: create -> deliver -> read -> list
 * 1.8.12  Idempotency guarantees
 * 1.8.13  Workflow -> Notification E2E
 *
 * Requires: Postgres running (DATABASE_URL)
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '@fmksa/db';
import {
  notify,
  markAsRead,
  listForUser,
  getUnreadCount,
} from '../../src/notifications/service';
import * as workflowEvents from '../../src/workflow/events';
import { registerWorkflowNotificationHandlers } from '../../src/notifications/event-handlers';

const ts = `int-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

// ============================================================================
// 1.8.11 — Notification Lifecycle
// ============================================================================

describe('Task 1.8.11 — Notification Lifecycle', () => {
  let user: { id: string };
  let notificationId: string;

  beforeAll(async () => {
    user = await prisma.user.create({
      data: {
        email: `lifecycle-${ts}@test.com`,
        name: 'Lifecycle User',
        passwordHash: 'hash',
        status: 'active',
      },
    });
  });

  it('create -> deliver -> read -> list full lifecycle', async () => {
    const iKey = `lifecycle-${ts}`;

    // 1. Create a notification via notify() with in_app channel
    await notify({
      templateCode: 'user_invited',
      recipients: [{ id: user.id, name: 'Lifecycle User' }],
      payload: { inviterName: 'Admin' },
      idempotencyKey: iKey,
      channels: ['in_app'],
    });

    // 2. Verify it appears in listForUser() as unread
    const listBefore = await listForUser(user.id, { unreadOnly: true });
    const found = listBefore.items.find(
      (n) => n.subject === 'Welcome to Fun Makers KSA',
    );
    expect(found).toBeDefined();
    expect(found!.readAt).toBeNull();
    expect(found!.status).toBe('sent');
    notificationId = found!.id;

    // 3. Verify getUnreadCount() reflects it
    const countBefore = await getUnreadCount(user.id);
    expect(countBefore).toBeGreaterThanOrEqual(1);

    // 4. Call markAsRead()
    await markAsRead(notificationId, user.id);

    // 5. Verify it appears as read in listForUser()
    const listAfter = await listForUser(user.id, { limit: 50 });
    const readNotif = listAfter.items.find((n) => n.id === notificationId);
    expect(readNotif).toBeDefined();
    expect(readNotif!.status).toBe('read');
    expect(readNotif!.readAt).not.toBeNull();

    // 6. Verify getUnreadCount() decreases
    const countAfter = await getUnreadCount(user.id);
    expect(countAfter).toBe(countBefore - 1);

    // 7. Test markAsRead() is idempotent (calling twice doesn't error)
    await expect(markAsRead(notificationId, user.id)).resolves.toBeUndefined();

    // Verify readAt didn't change on the second call
    const afterIdempotent = await prisma.notification.findUnique({
      where: { id: notificationId },
    });
    expect(afterIdempotent!.readAt!.getTime()).toBe(
      readNotif!.readAt!.getTime(),
    );
  });
});

// ============================================================================
// 1.8.12 — Idempotency
// ============================================================================

describe('Task 1.8.12 — Idempotency', () => {
  let userA: { id: string };
  let userB: { id: string };

  beforeAll(async () => {
    [userA, userB] = await Promise.all([
      prisma.user.create({
        data: {
          email: `idem-a-${ts}@test.com`,
          name: 'Idempotency User A',
          passwordHash: 'hash',
          status: 'active',
        },
      }),
      prisma.user.create({
        data: {
          email: `idem-b-${ts}@test.com`,
          name: 'Idempotency User B',
          passwordHash: 'hash',
          status: 'active',
        },
      }),
    ]);
  });

  it('same key + same recipient + same channel produces only ONE row', async () => {
    const iKey = `idem-dup-${ts}`;
    const callPayload = {
      templateCode: 'user_invited',
      recipients: [{ id: userA.id }],
      payload: { inviterName: 'Admin' },
      idempotencyKey: iKey,
      channels: ['in_app'] as ['in_app'],
    };

    await notify(callPayload);
    await notify(callPayload); // second call — should be skipped

    const count = await prisma.notification.count({
      where: { userId: userA.id, idempotencyKey: iKey, channel: 'in_app' },
    });
    expect(count).toBe(1);
  });

  it('same key but DIFFERENT channel creates a new row', async () => {
    const iKey = `idem-chan-${ts}`;

    await notify({
      templateCode: 'user_invited',
      recipients: [{ id: userA.id }],
      payload: { inviterName: 'Admin' },
      idempotencyKey: iKey,
      channels: ['in_app'],
    });

    await notify({
      templateCode: 'user_invited',
      recipients: [{ id: userA.id }],
      payload: { inviterName: 'Admin' },
      idempotencyKey: iKey,
      channels: ['email'],
    });

    const inAppCount = await prisma.notification.count({
      where: { userId: userA.id, idempotencyKey: iKey, channel: 'in_app' },
    });
    const emailCount = await prisma.notification.count({
      where: { userId: userA.id, idempotencyKey: iKey, channel: 'email' },
    });

    expect(inAppCount).toBe(1);
    expect(emailCount).toBe(1);
  });

  it('same key but DIFFERENT recipient creates a new row', async () => {
    const iKey = `idem-recip-${ts}`;

    await notify({
      templateCode: 'user_invited',
      recipients: [{ id: userA.id }],
      payload: { inviterName: 'Admin' },
      idempotencyKey: iKey,
      channels: ['in_app'],
    });

    await notify({
      templateCode: 'user_invited',
      recipients: [{ id: userB.id }],
      payload: { inviterName: 'Admin' },
      idempotencyKey: iKey,
      channels: ['in_app'],
    });

    const countA = await prisma.notification.count({
      where: { userId: userA.id, idempotencyKey: iKey, channel: 'in_app' },
    });
    const countB = await prisma.notification.count({
      where: { userId: userB.id, idempotencyKey: iKey, channel: 'in_app' },
    });

    expect(countA).toBe(1);
    expect(countB).toBe(1);
  });
});

// ============================================================================
// 1.8.13 — Workflow -> Notification E2E
// ============================================================================

describe('Task 1.8.13 — Workflow -> Notification E2E', () => {
  let starterUser: { id: string };
  let approverUser: { id: string };
  let entity: { id: string };
  let project: { id: string };
  let template: { id: string };
  let step1: { id: string; name: string };
  let step2: { id: string; name: string };
  let instance: { id: string };

  // Check if required notification templates exist
  let templatesExist = false;

  beforeAll(async () => {
    // Verify templates are seeded — skip gracefully if not
    const [stepTpl, approvedTpl] = await Promise.all([
      prisma.notificationTemplate.findUnique({
        where: { code: 'workflow_step_assigned' },
      }),
      prisma.notificationTemplate.findUnique({
        where: { code: 'workflow_approved' },
      }),
    ]);

    if (!stepTpl || !approvedTpl) {
      console.warn(
        'Skipping Task 1.8.13: notification templates "workflow_step_assigned" ' +
          'and/or "workflow_approved" not found in DB. Run seed first.',
      );
      return;
    }
    templatesExist = true;

    // Create test users
    [starterUser, approverUser] = await Promise.all([
      prisma.user.create({
        data: {
          email: `e2e-starter-${ts}@test.com`,
          name: 'E2E Starter',
          passwordHash: 'hash',
          status: 'active',
        },
      }),
      prisma.user.create({
        data: {
          email: `e2e-approver-${ts}@test.com`,
          name: 'E2E Approver',
          passwordHash: 'hash',
          status: 'active',
        },
      }),
    ]);

    // Create entity and project
    entity = await prisma.entity.create({
      data: {
        name: `Entity ${ts}`,
        code: `ENT-${ts}`,
        type: 'parent',
        status: 'active',
      },
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
        name: `E2E Doc Controller ${ts}`,
        code: `e2e_doc_ctrl_${ts}`,
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

    // Create workflow template + steps
    template = await prisma.workflowTemplate.create({
      data: {
        code: `wf-e2e-${ts}`,
        name: `Test E2E WF ${ts}`,
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
        name: 'E2E Step 1 Review',
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
        name: 'E2E Step 2 Approval',
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
        recordId: `doc-e2e-${ts}`,
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

  it('workflow.stepApproved creates notification for next-step approver', async () => {
    if (!templatesExist) {
      console.warn('Skipped — templates not seeded');
      return;
    }

    const before = await prisma.notification.count({
      where: { userId: approverUser.id, templateCode: 'workflow_step_assigned' },
    });

    await workflowEvents.emit('workflow.stepApproved', {
      instanceId: instance.id,
      templateCode: `wf-e2e-${ts}`,
      recordType: 'document',
      recordId: `doc-e2e-${ts}`,
      projectId: project.id,
      actorUserId: starterUser.id,
      stepName: step1.name,
    });

    const after = await prisma.notification.count({
      where: { userId: approverUser.id, templateCode: 'workflow_step_assigned' },
    });
    expect(after).toBeGreaterThan(before);

    // Verify notification content was rendered from template
    const notification = await prisma.notification.findFirst({
      where: {
        userId: approverUser.id,
        templateCode: 'workflow_step_assigned',
        channel: 'in_app',
      },
      orderBy: { createdAt: 'desc' },
    });
    expect(notification).not.toBeNull();
    expect(notification!.subject).toContain(step2.name);
    expect(notification!.body).toContain(step2.name);
    expect(notification!.body).toContain('document');
  });

  it('workflow.approved creates notification for workflow starter', async () => {
    if (!templatesExist) {
      console.warn('Skipped — templates not seeded');
      return;
    }

    const before = await prisma.notification.count({
      where: { userId: starterUser.id, templateCode: 'workflow_approved' },
    });

    await workflowEvents.emit('workflow.approved', {
      instanceId: instance.id,
      templateCode: `wf-e2e-${ts}`,
      recordType: 'document',
      recordId: `doc-e2e-${ts}`,
      projectId: project.id,
      actorUserId: approverUser.id,
    });

    const after = await prisma.notification.count({
      where: { userId: starterUser.id, templateCode: 'workflow_approved' },
    });
    expect(after).toBeGreaterThan(before);

    // Verify notification content was rendered from template
    const notification = await prisma.notification.findFirst({
      where: {
        userId: starterUser.id,
        templateCode: 'workflow_approved',
        channel: 'in_app',
      },
      orderBy: { createdAt: 'desc' },
    });
    expect(notification).not.toBeNull();
    expect(notification!.subject).toContain('document');
    expect(notification!.subject).toContain(`doc-e2e-${ts}`);
    expect(notification!.subject).toContain('approved');
    expect(notification!.body).toContain('approved');
  });
});
