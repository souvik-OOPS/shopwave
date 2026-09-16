import Redis from 'ioredis';

import { env } from '@/config/env';
import { logger } from '@/lib/logger';

/**
 * Redis is an optimisation, never a dependency. If it is not configured — or it falls
 * over at runtime — every helper here degrades to "cache miss" and the request still
 * serves from PostgreSQL.
 */
let client: Redis | null = null;
let connectionHealthy = false;

if (env.REDIS_ENABLED && env.REDIS_URL) {
  client = new Redis(env.REDIS_URL, {
    maxRetriesPerRequest: 2,
    enableOfflineQueue: false,
    lazyConnect: true,
    retryStrategy: (times) => (times > 5 ? null : Math.min(times * 200, 2000)),
  });

  client.on('ready', () => {
    connectionHealthy = true;
    logger.info('Redis connected');
  });
  client.on('error', (error: Error) => {
    connectionHealthy = false;
    logger.warn({ err: error.message }, 'Redis error — falling back to database');
  });
  client.on('end', () => {
    connectionHealthy = false;
  });

  void client.connect().catch((error: unknown) => {
    connectionHealthy = false;
    logger.warn({ err: error }, 'Redis initial connection failed — caching disabled');
  });
}

export const redis = client;

export function isCacheAvailable(): boolean {
  return client !== null && connectionHealthy;
}

export async function cacheGet<T>(key: string): Promise<T | null> {
  if (!isCacheAvailable() || !client) return null;
  try {
    const raw = await client.get(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch (error) {
    logger.debug({ err: error, key }, 'cacheGet failed');
    return null;
  }
}

export async function cacheSet(key: string, value: unknown, ttlSeconds: number): Promise<void> {
  if (!isCacheAvailable() || !client) return;
  try {
    await client.set(key, JSON.stringify(value), 'EX', ttlSeconds);
  } catch (error) {
    logger.debug({ err: error, key }, 'cacheSet failed');
  }
}

/** Invalidate a namespace, e.g. `products:*` after a catalog write. */
export async function cacheInvalidate(pattern: string): Promise<void> {
  if (!isCacheAvailable() || !client) return;
  try {
    const stream = client.scanStream({ match: pattern, count: 100 });
    const keys: string[] = [];
    for await (const chunk of stream) {
      keys.push(...(chunk as string[]));
    }
    if (keys.length > 0) await client.del(...keys);
  } catch (error) {
    logger.debug({ err: error, pattern }, 'cacheInvalidate failed');
  }
}

/** Read-through helper: returns cached value or computes, stores and returns it. */
export async function cacheRemember<T>(
  key: string,
  ttlSeconds: number,
  producer: () => Promise<T>,
): Promise<T> {
  const cached = await cacheGet<T>(key);
  if (cached !== null) return cached;

  const value = await producer();
  await cacheSet(key, value, ttlSeconds);
  return value;
}

export async function disconnectRedis(): Promise<void> {
  if (!client) return;
  try {
    await client.quit();
  } catch {
    client.disconnect();
  }
}
