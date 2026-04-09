import { Queue } from 'bullmq';
import IORedis, { type Redis } from 'ioredis';

const REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379';

let sharedConnection: Redis | undefined;
const queues = new Map<string, Queue>();

/**
 * Return (or lazily create) the shared IORedis connection used by every queue
 * and worker in this process. BullMQ requires `maxRetriesPerRequest: null` on
 * the underlying connection.
 */
export function getRedisConnection(): Redis {
  if (!sharedConnection) {
    sharedConnection = new IORedis(REDIS_URL, {
      maxRetriesPerRequest: null,
    });
  }
  return sharedConnection;
}

/**
 * Return (or lazily create) a BullMQ queue of the given name using the shared
 * Redis connection.
 */
export function getQueue(name: string): Queue {
  const existing = queues.get(name);
  if (existing) return existing;

  const queue = new Queue(name, {
    connection: getRedisConnection(),
  });
  queues.set(name, queue);
  return queue;
}

/**
 * Close every queue and the shared Redis connection. Called from the process
 * shutdown handler so SIGTERM/SIGINT can exit cleanly.
 */
export async function closeAllQueues(): Promise<void> {
  for (const queue of queues.values()) {
    await queue.close();
  }
  queues.clear();
  if (sharedConnection) {
    await sharedConnection.quit();
    sharedConnection = undefined;
  }
}
