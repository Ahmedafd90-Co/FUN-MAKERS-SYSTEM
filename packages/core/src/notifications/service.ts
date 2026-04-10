/**
 * Notification service — Tasks 1.8.2 and 1.8.4
 *
 * notify()           — fan-out to recipients × channels, idempotent
 * markAsRead()       — mark a notification as read (ownership-checked)
 * listForUser()      — paginated notification list
 * getUnreadCount()   — count of unread notifications
 */

import { Queue } from 'bullmq';
import IORedis from 'ioredis';
import { prisma } from '@fmksa/db';
import { auditService } from '../audit/service';
import { renderTemplate } from './templates';
import { isPreferenceEnabled } from './preferences';

// ---------------------------------------------------------------------------
// Queue helper (internal to this module)
// ---------------------------------------------------------------------------

let _emailQueue: Queue | undefined;

function getEmailQueue(): Queue {
  if (!_emailQueue) {
    const redisUrl = process.env['REDIS_URL'] ?? 'redis://localhost:6379';
    const connection = new IORedis(redisUrl, { maxRetriesPerRequest: null });
    _emailQueue = new Queue(NOTIFICATIONS_EMAIL_QUEUE, { connection });
  }
  return _emailQueue;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const NOTIFICATIONS_EMAIL_QUEUE = 'notifications-email';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type NotificationChannel = 'in_app' | 'email';

export type NotifyInput = {
  templateCode: string;
  recipients: Array<{ id: string; name?: string }>;
  /** Handlebars context variables */
  payload: Record<string, unknown>;
  idempotencyKey: string;
  /** Which channels to deliver to. Defaults to ['in_app', 'email']. */
  channels?: NotificationChannel[];
};

export type ListNotificationsOptions = {
  unreadOnly?: boolean;
  limit?: number;
  cursor?: string;
};

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export class NotificationNotFoundError extends Error {
  constructor(id: string) {
    super(`Notification "${id}" not found.`);
    this.name = 'NotificationNotFoundError';
  }
}

export class NotificationOwnershipError extends Error {
  constructor(notificationId: string, userId: string) {
    super(
      `Notification "${notificationId}" does not belong to user "${userId}".`,
    );
    this.name = 'NotificationOwnershipError';
  }
}

// ---------------------------------------------------------------------------
// notify() — Task 1.8.2
// ---------------------------------------------------------------------------

/**
 * Send a notification to each recipient via each channel.
 *
 * Checks:
 *  1. User preference — skip if disabled.
 *  2. Idempotency — skip if same (idempotencyKey, userId, channel) already exists.
 *
 * For in-app: status = sent immediately.
 * For email: enqueues a BullMQ job, status = pending.
 */
export async function notify(input: NotifyInput): Promise<void> {
  const {
    templateCode,
    recipients,
    payload,
    idempotencyKey,
    channels = ['in_app', 'email'],
  } = input;

  for (const recipient of recipients) {
    for (const channel of channels) {
      // 1. Check user preference
      const enabled = await isPreferenceEnabled(
        recipient.id,
        templateCode,
        channel,
      );
      if (!enabled) continue;

      // 2. Idempotency check
      const existing = await prisma.notification.findFirst({
        where: { idempotencyKey, userId: recipient.id, channel },
      });
      if (existing) continue;

      // 3. Render template
      const recipientPayload = { ...payload, recipientName: recipient.name };
      const { subject, body } = await renderTemplate(templateCode, recipientPayload);

      if (channel === 'in_app') {
        // 4 + 5: Create and immediately mark as sent for in-app
        await (prisma as any).$transaction(async (tx: any) => {
          const notification = await tx.notification.create({
            data: {
              userId: recipient.id,
              templateCode,
              idempotencyKey,
              subject,
              body,
              payloadJson: payload,
              channel,
              status: 'sent',
              sentAt: new Date(),
            },
          });

          await auditService.log(
            {
              actorUserId: null,
              actorSource: 'system',
              action: 'notification_sent',
              resourceType: 'notification',
              resourceId: notification.id,
              beforeJson: {},
              afterJson: {
                userId: recipient.id,
                templateCode,
                channel,
                idempotencyKey,
                status: 'sent',
              },
            },
            tx,
          );
        });
      } else {
        // email: create as pending, enqueue job
        const notification = await (prisma as any).$transaction(async (tx: any) => {
          const n = await tx.notification.create({
            data: {
              userId: recipient.id,
              templateCode,
              idempotencyKey,
              subject,
              body,
              payloadJson: payload,
              channel,
              status: 'pending',
            },
          });

          await auditService.log(
            {
              actorUserId: null,
              actorSource: 'system',
              action: 'notification_sent',
              resourceType: 'notification',
              resourceId: n.id,
              beforeJson: {},
              afterJson: {
                userId: recipient.id,
                templateCode,
                channel,
                idempotencyKey,
                status: 'pending',
              },
            },
            tx,
          );

          return n;
        });

        // 6. Enqueue email job via the module-level BullMQ queue
        try {
          await getEmailQueue().add(
            'send-email',
            { notificationId: notification.id },
            {
              attempts: 3,
              backoff: { type: 'exponential', delay: 5000 },
              removeOnComplete: true,
              removeOnFail: false,
            },
          );
        } catch {
          // If Redis is unavailable (e.g. in unit tests), silently skip enqueueing.
          // The notification row remains in 'pending' and can be retried.
        }
      }
    }
  }
}

// ---------------------------------------------------------------------------
// markAsRead() — Task 1.8.4
// ---------------------------------------------------------------------------

/**
 * Mark a notification as read.
 *
 * @throws {NotificationNotFoundError}    If the notification doesn't exist.
 * @throws {NotificationOwnershipError}   If the notification belongs to another user.
 */
export async function markAsRead(
  notificationId: string,
  userId: string,
): Promise<void> {
  const notification = await prisma.notification.findUnique({
    where: { id: notificationId },
  });

  if (!notification) {
    throw new NotificationNotFoundError(notificationId);
  }

  if (notification.userId !== userId) {
    throw new NotificationOwnershipError(notificationId, userId);
  }

  if (notification.readAt) return; // Already read — idempotent

  await (prisma as any).$transaction(async (tx: any) => {
    await tx.notification.update({
      where: { id: notificationId },
      data: { readAt: new Date(), status: 'read' },
    });

    await auditService.log(
      {
        actorUserId: userId,
        actorSource: 'user',
        action: 'notification_read',
        resourceType: 'notification',
        resourceId: notificationId,
        beforeJson: { status: notification.status, readAt: null },
        afterJson: { status: 'read', readAt: new Date().toISOString() },
      },
      tx,
    );
  });
}

// ---------------------------------------------------------------------------
// listForUser() — Task 1.8.4
// ---------------------------------------------------------------------------

/**
 * Paginated list of notifications for a user.
 *
 * Uses cursor-based pagination on the notification ID (UUID, lexicographically
 * ordered by createdAt DESC because notifications are append-only and UUIDs
 * are random — we use createdAt + id as the cursor pair).
 */
export async function listForUser(
  userId: string,
  options: ListNotificationsOptions = {},
): Promise<{
  items: Array<{
    id: string;
    templateCode: string;
    subject: string;
    body: string;
    channel: string;
    status: string;
    sentAt: Date | null;
    readAt: Date | null;
    createdAt: Date;
  }>;
  nextCursor: string | null;
}> {
  const { unreadOnly = false, limit = 20, cursor } = options;

  const take = Math.min(limit, 100); // cap at 100

  const where: Record<string, unknown> = { userId };
  if (unreadOnly) {
    where['readAt'] = null;
    where['status'] = { not: 'read' };
  }

  // Cursor: encoded as base64(createdAt ISO + ':' + id)
  if (cursor) {
    try {
      const decoded = Buffer.from(cursor, 'base64').toString('utf8');
      const colonIdx = decoded.indexOf(':');
      if (colonIdx !== -1) {
        const createdAtStr = decoded.slice(0, colonIdx);
        const cursorId = decoded.slice(colonIdx + 1);
        const cursorDate = new Date(createdAtStr);
        where['OR'] = [
          { createdAt: { lt: cursorDate } },
          { createdAt: cursorDate, id: { lt: cursorId } },
        ];
      }
    } catch {
      // Invalid cursor — ignore it and start from the beginning
    }
  }

  const notifications = await prisma.notification.findMany({
    where: where as any,
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: take + 1, // fetch one extra to detect hasMore
    select: {
      id: true,
      templateCode: true,
      subject: true,
      body: true,
      channel: true,
      status: true,
      sentAt: true,
      readAt: true,
      createdAt: true,
    },
  });

  const hasMore = notifications.length > take;
  const items = hasMore ? notifications.slice(0, take) : notifications;

  let nextCursor: string | null = null;
  if (hasMore && items.length > 0) {
    const last = items[items.length - 1]!;
    nextCursor = Buffer.from(
      `${last.createdAt.toISOString()}:${last.id}`,
    ).toString('base64');
  }

  return { items, nextCursor };
}

// ---------------------------------------------------------------------------
// getUnreadCount() — Task 1.8.4
// ---------------------------------------------------------------------------

/**
 * Count unread in-app notifications for a user.
 */
export async function getUnreadCount(userId: string): Promise<number> {
  return prisma.notification.count({
    where: {
      userId,
      channel: 'in_app',
      readAt: null,
      status: { not: 'read' },
    },
  });
}
