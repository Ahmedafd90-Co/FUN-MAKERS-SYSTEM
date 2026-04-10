/**
 * System health tRPC router — Phase 1.9
 *
 * Provides an overview endpoint aggregating DB status, Redis status,
 * queue stats, and recent failed jobs. Admin-only.
 */
import {
  getDbStatus,
  getRedisStatus,
  getQueueStats,
  getRecentFailedJobs,
} from '@fmksa/core';

import { router, adminProcedure } from '../trpc';

const KNOWN_QUEUES = ['notifications-email'];

export const healthRouter = router({
  overview: adminProcedure.query(async () => {
    const [db, redis, ...queueResults] = await Promise.all([
      getDbStatus(),
      getRedisStatus(),
      ...KNOWN_QUEUES.map((q) => getQueueStats(q)),
    ]);

    // Only fetch failed jobs if Redis is connected
    const failedJobs = redis.connected
      ? await Promise.all(KNOWN_QUEUES.map((q) => getRecentFailedJobs(q, 10)))
      : [];

    return {
      db,
      redis,
      queues: queueResults,
      failedJobs: failedJobs.flat(),
    };
  }),
});
