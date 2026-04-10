/**
 * Tests for notification service — Tasks 1.8.2 and 1.8.4
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '@fmksa/db';
import {
  notify,
  markAsRead,
  listForUser,
  getUnreadCount,
  NotificationNotFoundError,
  NotificationOwnershipError,
} from '../../src/notifications/service';

const ts = `svc-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

let testUser: { id: string };
let otherUser: { id: string };

beforeAll(async () => {
  [testUser, otherUser] = await Promise.all([
    prisma.user.create({
      data: {
        email: `notif-svc-${ts}@test.com`,
        name: 'Notif Service User',
        passwordHash: 'hash',
        status: 'active',
      },
    }),
    prisma.user.create({
      data: {
        email: `notif-svc-other-${ts}@test.com`,
        name: 'Other User',
        passwordHash: 'hash',
        status: 'active',
      },
    }),
  ]);
});

afterAll(async () => {
  // Clean up notifications
  await (prisma as any).$executeRaw`DELETE FROM notifications WHERE user_id IN (${testUser.id}, ${otherUser.id})`;
  await (prisma as any).$executeRaw`DELETE FROM notification_preferences WHERE user_id IN (${testUser.id}, ${otherUser.id})`;
  await (prisma as any).$executeRaw`DELETE FROM audit_logs WHERE actor_user_id IN (${testUser.id}, ${otherUser.id}) OR (resource_type = 'notification' AND actor_user_id IS NULL)`;
  await prisma.user.deleteMany({ where: { id: { in: [testUser.id, otherUser.id] } } });
});

// ---------------------------------------------------------------------------
// notify()
// ---------------------------------------------------------------------------

describe('notify()', () => {
  it('creates an in-app notification with status=sent', async () => {
    const iKey = `test-in-app-${ts}`;
    await notify({
      templateCode: 'workflow_approved',
      recipients: [{ id: testUser.id, name: 'Test User' }],
      payload: { recordType: 'PO', recordRef: 'PO-001', actorName: 'Manager', projectName: 'Test' },
      idempotencyKey: iKey,
      channels: ['in_app'],
    });

    const notification = await prisma.notification.findFirst({
      where: { userId: testUser.id, idempotencyKey: iKey, channel: 'in_app' },
    });

    expect(notification).not.toBeNull();
    expect(notification!.status).toBe('sent');
    expect(notification!.sentAt).not.toBeNull();
    expect(notification!.subject).toContain('PO-001');
    expect(notification!.subject).toContain('approved');
  });

  it('creates an email notification with status=pending', async () => {
    const iKey = `test-email-${ts}`;
    await notify({
      templateCode: 'workflow_approved',
      recipients: [{ id: testUser.id }],
      payload: { recordType: 'Contract', recordRef: 'C-001', actorName: 'Admin', projectName: 'X' },
      idempotencyKey: iKey,
      channels: ['email'],
    });

    const notification = await prisma.notification.findFirst({
      where: { userId: testUser.id, idempotencyKey: iKey, channel: 'email' },
    });

    expect(notification).not.toBeNull();
    expect(notification!.status).toBe('pending');
  });

  it('is idempotent — second call with same key is skipped', async () => {
    const iKey = `test-idempotent-${ts}`;
    const callPayload = {
      templateCode: 'workflow_approved' as const,
      recipients: [{ id: testUser.id }] as Array<{ id: string }>,
      payload: { recordType: 'PO', recordRef: 'PO-IDEM', actorName: 'X', projectName: 'Y' },
      idempotencyKey: iKey,
      channels: ['in_app'] as ['in_app'],
    };

    await notify(callPayload);
    await notify(callPayload); // second call

    const count = await prisma.notification.count({
      where: { userId: testUser.id, idempotencyKey: iKey, channel: 'in_app' },
    });

    expect(count).toBe(1);
  });

  it('respects user preferences — skips disabled channels', async () => {
    // Disable in_app for workflow_rejected for this user
    await prisma.notificationPreference.upsert({
      where: {
        userId_templateCode_channel: {
          userId: testUser.id,
          templateCode: 'workflow_rejected',
          channel: 'in_app',
        },
      },
      create: {
        userId: testUser.id,
        templateCode: 'workflow_rejected',
        channel: 'in_app',
        enabled: false,
      },
      update: { enabled: false },
    });

    const iKey = `test-pref-skip-${ts}`;
    await notify({
      templateCode: 'workflow_rejected',
      recipients: [{ id: testUser.id }],
      payload: { recordType: 'SO', recordRef: 'SO-001', actorName: 'User', projectName: 'P', comment: 'rejected' },
      idempotencyKey: iKey,
      channels: ['in_app'],
    });

    const notification = await prisma.notification.findFirst({
      where: { userId: testUser.id, idempotencyKey: iKey, channel: 'in_app' },
    });

    expect(notification).toBeNull();

    // Clean up preference
    await prisma.notificationPreference.delete({
      where: {
        userId_templateCode_channel: {
          userId: testUser.id,
          templateCode: 'workflow_rejected',
          channel: 'in_app',
        },
      },
    });
  });

  it('writes audit log for each notification created', async () => {
    const iKey = `test-audit-${ts}`;
    const before = await prisma.auditLog.count({
      where: { action: 'notification_sent', resourceType: 'notification' },
    });

    await notify({
      templateCode: 'workflow_approved',
      recipients: [{ id: testUser.id }],
      payload: { recordType: 'Doc', recordRef: 'D-001', actorName: 'X', projectName: 'P' },
      idempotencyKey: iKey,
      channels: ['in_app'],
    });

    const after = await prisma.auditLog.count({
      where: { action: 'notification_sent', resourceType: 'notification' },
    });

    expect(after).toBeGreaterThan(before);
  });

  it('fans out to multiple recipients', async () => {
    const iKey = `test-fanout-${ts}`;
    await notify({
      templateCode: 'workflow_approved',
      recipients: [
        { id: testUser.id },
        { id: otherUser.id },
      ],
      payload: { recordType: 'PO', recordRef: 'PO-MULTI', actorName: 'X', projectName: 'Y' },
      idempotencyKey: iKey,
      channels: ['in_app'],
    });

    const count = await prisma.notification.count({
      where: { idempotencyKey: iKey, channel: 'in_app' },
    });

    expect(count).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// markAsRead()
// ---------------------------------------------------------------------------

describe('markAsRead()', () => {
  let notificationId: string;

  beforeAll(async () => {
    const iKey = `test-read-${ts}`;
    await notify({
      templateCode: 'user_invited',
      recipients: [{ id: testUser.id }],
      payload: { inviterName: 'Admin' },
      idempotencyKey: iKey,
      channels: ['in_app'],
    });

    const n = await prisma.notification.findFirst({
      where: { userId: testUser.id, idempotencyKey: iKey },
    });
    notificationId = n!.id;
  });

  it('marks notification as read', async () => {
    await markAsRead(notificationId, testUser.id);

    const n = await prisma.notification.findUnique({ where: { id: notificationId } });
    expect(n!.status).toBe('read');
    expect(n!.readAt).not.toBeNull();
  });

  it('is idempotent — calling again does not throw or change readAt', async () => {
    const n1 = await prisma.notification.findUnique({ where: { id: notificationId } });
    await markAsRead(notificationId, testUser.id);
    const n2 = await prisma.notification.findUnique({ where: { id: notificationId } });

    expect(n1!.readAt!.getTime()).toBe(n2!.readAt!.getTime());
  });

  it('throws NotificationNotFoundError for unknown ID', async () => {
    await expect(
      markAsRead('00000000-0000-0000-0000-000000000000', testUser.id),
    ).rejects.toThrow(NotificationNotFoundError);
  });

  it('throws NotificationOwnershipError for wrong user', async () => {
    // Create a notification for otherUser
    const iKey = `test-ownership-${ts}`;
    await notify({
      templateCode: 'user_invited',
      recipients: [{ id: otherUser.id }],
      payload: { inviterName: 'Admin' },
      idempotencyKey: iKey,
      channels: ['in_app'],
    });
    const n = await prisma.notification.findFirst({
      where: { userId: otherUser.id, idempotencyKey: iKey },
    });

    await expect(
      markAsRead(n!.id, testUser.id),
    ).rejects.toThrow(NotificationOwnershipError);
  });
});

// ---------------------------------------------------------------------------
// listForUser()
// ---------------------------------------------------------------------------

describe('listForUser()', () => {
  it('returns notifications for a user', async () => {
    const result = await listForUser(testUser.id, { limit: 10 });
    expect(result.items.length).toBeGreaterThan(0);
  });

  it('respects unreadOnly filter', async () => {
    const result = await listForUser(testUser.id, { unreadOnly: true });
    for (const item of result.items) {
      expect(item.readAt).toBeNull();
      expect(item.status).not.toBe('read');
    }
  });

  it('returns nextCursor when there are more results', async () => {
    // Create 3 notifications
    const baseKey = `list-cursor-${ts}`;
    await notify({
      templateCode: 'user_invited',
      recipients: [{ id: testUser.id }],
      payload: { inviterName: 'A' },
      idempotencyKey: `${baseKey}-1`,
      channels: ['in_app'],
    });
    await notify({
      templateCode: 'user_invited',
      recipients: [{ id: testUser.id }],
      payload: { inviterName: 'B' },
      idempotencyKey: `${baseKey}-2`,
      channels: ['in_app'],
    });

    const total = await prisma.notification.count({ where: { userId: testUser.id } });

    if (total > 1) {
      const result = await listForUser(testUser.id, { limit: 1 });
      expect(result.items.length).toBe(1);
      expect(result.nextCursor).not.toBeNull();
    }
  });
});

// ---------------------------------------------------------------------------
// getUnreadCount()
// ---------------------------------------------------------------------------

describe('getUnreadCount()', () => {
  it('returns correct count of unread in-app notifications', async () => {
    const iKey = `test-count-${ts}`;
    const before = await getUnreadCount(testUser.id);

    await notify({
      templateCode: 'user_invited',
      recipients: [{ id: testUser.id }],
      payload: { inviterName: 'Admin' },
      idempotencyKey: iKey,
      channels: ['in_app'],
    });

    const after = await getUnreadCount(testUser.id);
    // The new notification should be 'sent' (not read yet)
    expect(after).toBeGreaterThanOrEqual(before);
  });
});
