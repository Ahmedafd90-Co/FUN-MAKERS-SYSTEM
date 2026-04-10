/**
 * Notifications email worker — Task 1.8.5
 *
 * Subscribes to the `notifications-email` queue.
 * For each job:
 *   1. Load notification by ID.
 *   2. Load the recipient user email address.
 *   3. Send via the delivery adapter.
 *   4. Mark notification status = sent, sentAt = now.
 *   5. On all retries exhausted: mark status = failed.
 */

import { Worker, type Job } from 'bullmq';
import { prisma } from '@fmksa/db';
import { sendEmail } from '@fmksa/core/notifications/delivery';
import { getRedisConnection } from '../queue';

export const NOTIFICATIONS_EMAIL_QUEUE = 'notifications-email';

// ---------------------------------------------------------------------------
// Job payload type
// ---------------------------------------------------------------------------

type EmailJobData = {
  notificationId: string;
};

// ---------------------------------------------------------------------------
// Worker processor
// ---------------------------------------------------------------------------

async function processEmailJob(job: Job<EmailJobData>): Promise<void> {
  const { notificationId } = job.data;

  // Load notification with user
  const notification = await (prisma as any).notification.findUnique({
    where: { id: notificationId },
    include: { user: { select: { email: true, name: true } } },
  });

  if (!notification) {
    // Notification deleted — nothing to do; complete the job normally
    // eslint-disable-next-line no-console
    console.warn(
      `[notifications-worker] Notification ${notificationId} not found; skipping.`,
    );
    return;
  }

  if (notification.status === 'sent' || notification.status === 'read') {
    // Already delivered — idempotent; skip
    return;
  }

  const userEmail = notification.user?.email;
  if (!userEmail) {
    throw new Error(
      `Notification ${notificationId} recipient has no email address.`,
    );
  }

  // Send the email
  await sendEmail({
    to: userEmail,
    subject: notification.subject as string,
    text: notification.body as string,
    html: notification.body as string,
  });

  // Update status to sent
  await (prisma as any).notification.update({
    where: { id: notificationId },
    data: { status: 'sent', sentAt: new Date() },
  });
}

// ---------------------------------------------------------------------------
// Worker factory
// ---------------------------------------------------------------------------

/**
 * Create and start the notifications email worker.
 *
 * The worker will use BullMQ's built-in retry (3 attempts, exponential
 * backoff). After all retries are exhausted BullMQ emits `failed` — we
 * listen to that event to mark the DB row as failed.
 */
export function createNotificationsWorker(): Worker<EmailJobData> {
  const worker = new Worker<EmailJobData>(
    NOTIFICATIONS_EMAIL_QUEUE,
    processEmailJob,
    {
      connection: getRedisConnection(),
      concurrency: 5,
    },
  );

  // On permanent failure: mark notification as failed
  worker.on('failed', (job, err) => {
    if (!job) return;
    const { notificationId } = job.data;
    // eslint-disable-next-line no-console
    console.error(
      `[notifications-worker] Job ${job.id} failed for notification ${notificationId}:`,
      err,
    );

    // Best-effort update — don't await to avoid blocking the event loop
    void (prisma as any).notification
      .update({
        where: { id: notificationId },
        data: { status: 'failed' },
      })
      .catch((updateErr: unknown) => {
        console.error(
          `[notifications-worker] Failed to mark notification ${notificationId} as failed:`,
          updateErr,
        );
      });
  });

  return worker;
}
