/**
 * System health check functions — Phase 1.9
 *
 * Provides DB, Redis, and BullMQ queue health information.
 * Designed for the admin system health dashboard.
 */
import { prisma } from '@fmksa/db';
import { Queue } from 'bullmq';
import IORedis from 'ioredis';

// ---------------------------------------------------------------------------
// Redis connection (lazy, separate from jobs workers)
// ---------------------------------------------------------------------------

let _healthRedis: IORedis | undefined;

function getHealthRedis(): IORedis {
  if (!_healthRedis) {
    const redisUrl = process.env['REDIS_URL'] ?? 'redis://localhost:6379';
    _healthRedis = new IORedis(redisUrl, { maxRetriesPerRequest: null });
  }
  return _healthRedis;
}

// ---------------------------------------------------------------------------
// DB Status
// ---------------------------------------------------------------------------

export async function getDbStatus(): Promise<{ connected: boolean; latencyMs: number }> {
  const start = Date.now();
  try {
    await (prisma as any).$queryRaw`SELECT 1`;
    return { connected: true, latencyMs: Date.now() - start };
  } catch {
    return { connected: false, latencyMs: Date.now() - start };
  }
}

// ---------------------------------------------------------------------------
// Redis Status
// ---------------------------------------------------------------------------

export async function getRedisStatus(): Promise<{ connected: boolean; latencyMs: number }> {
  const start = Date.now();
  try {
    const redis = getHealthRedis();
    await redis.ping();
    return { connected: true, latencyMs: Date.now() - start };
  } catch {
    return { connected: false, latencyMs: Date.now() - start };
  }
}

// ---------------------------------------------------------------------------
// Queue Stats
// ---------------------------------------------------------------------------

export type QueueStats = {
  name: string;
  active: number;
  waiting: number;
  completed: number;
  failed: number;
  delayed: number;
};

export async function getQueueStats(queueName: string): Promise<QueueStats> {
  const queue = new Queue(queueName, { connection: getHealthRedis() });
  try {
    const counts = await queue.getJobCounts('active', 'waiting', 'completed', 'failed', 'delayed');
    return {
      name: queueName,
      active: counts.active ?? 0,
      waiting: counts.waiting ?? 0,
      completed: counts.completed ?? 0,
      failed: counts.failed ?? 0,
      delayed: counts.delayed ?? 0,
    };
  } catch {
    return { name: queueName, active: 0, waiting: 0, completed: 0, failed: 0, delayed: 0 };
  }
}

// ---------------------------------------------------------------------------
// Recent Failed Jobs
// ---------------------------------------------------------------------------

export type FailedJob = {
  id: string | undefined;
  name: string;
  error: string;
  timestamp: number;
};

export async function getRecentFailedJobs(queueName: string, limit = 10): Promise<FailedJob[]> {
  const queue = new Queue(queueName, { connection: getHealthRedis() });
  try {
    const jobs = await queue.getFailed(0, limit - 1);
    return jobs.map((job) => ({
      id: job.id,
      name: job.name,
      error: job.failedReason ?? 'Unknown error',
      timestamp: job.finishedOn ?? job.processedOn ?? job.timestamp,
    }));
  } catch {
    return [];
  }
}
