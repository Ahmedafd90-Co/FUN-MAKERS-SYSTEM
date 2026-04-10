import { Worker, type Job } from 'bullmq';

import { getRedisConnection } from '../queue';

export const PLACEHOLDER_QUEUE_NAME = 'placeholder';

/**
 * Stub worker so the process has something to listen on during Phase 1.1
 * scaffolding. Real workers (notifications dispatcher, posting retries,
 * document indexing, audit exports) replace this in Phase 1.10.
 */
export function createPlaceholderWorker(): Worker {
  return new Worker(
    PLACEHOLDER_QUEUE_NAME,
    async (job: Job) => {
      // eslint-disable-next-line no-console -- worker stub, replaced by structured logger in Phase 1.10
      console.warn(
        `[jobs] placeholder worker received job ${job.id ?? '<no-id>'} (${job.name})`,
      );
      return { ok: true };
    },
    {
      connection: getRedisConnection(),
    },
  );
}
