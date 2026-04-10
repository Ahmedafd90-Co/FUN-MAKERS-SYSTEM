import { closeAllQueues } from './queue';
import { createPlaceholderWorker } from './workers/placeholder.worker';
import { createNotificationsWorker } from './workers/notifications.worker';

async function main(): Promise<void> {
  const placeholderWorker = createPlaceholderWorker();
  const notificationsWorker = createNotificationsWorker();

  // eslint-disable-next-line no-console -- startup log, replaced by structured logger in Phase 1.10
  console.warn('[jobs] workers started: placeholder, notifications-email');

  const shutdown = async (signal: NodeJS.Signals): Promise<void> => {
    // eslint-disable-next-line no-console -- shutdown log, replaced by structured logger in Phase 1.10
    console.warn(`[jobs] received ${signal}, draining workers...`);
    try {
      await Promise.all([
        placeholderWorker.close(),
        notificationsWorker.close(),
      ]);
      await closeAllQueues();
      process.exit(0);
    } catch (err) {
      console.error('[jobs] error during shutdown', err);
      process.exit(1);
    }
  };

  process.on('SIGTERM', (signal) => {
    void shutdown(signal);
  });
  process.on('SIGINT', (signal) => {
    void shutdown(signal);
  });
}

void main();

export { getQueue, getRedisConnection, closeAllQueues } from './queue';
export { createPlaceholderWorker, PLACEHOLDER_QUEUE_NAME } from './workers/placeholder.worker';
export { createNotificationsWorker, NOTIFICATIONS_EMAIL_QUEUE } from './workers/notifications.worker';
