import rateLimit, {
  MemoryStore,
  type ClientRateLimitInfo,
  type Options,
  type RateLimitRequestHandler,
  type Store,
} from 'express-rate-limit';
import RedisStore from 'rate-limit-redis';
import type { Request, Response } from 'express';

import { env, isTest } from '@/config/env';
import { logger } from '@/lib/logger';
import { isCacheAvailable, redis } from '@/lib/redis';
import { ErrorCode } from '@/utils/ApiError';

/**
 * Counts in Redis while it is reachable, so limits hold across instances and restarts,
 * and in memory while it is not — Redis stays an optimisation, never a dependency.
 *
 * The Redis store is built on first use, not at import. The limiters are created while
 * Redis is still connecting, and RedisStore loads its Lua scripts in its constructor:
 * built eagerly it either rejects unhandled (which shuts the server down) or, behind an
 * "is Redis up yet?" guard, is never built at all and every limit stays per-instance.
 */
class FallbackStore implements Store {
  readonly prefix: string;
  private readonly memory = new MemoryStore();
  private redisStore: RedisStore | null = null;
  private options: Options | null = null;

  constructor(private readonly name: string) {
    // Distinct per limiter, so express-rate-limit's double-count check tells them apart.
    this.prefix = `rl:${name}:`;
  }

  init(options: Options): void {
    this.options = options;
    this.memory.init(options);
  }

  private current(): Store {
    const client = redis;
    if (!client || !isCacheAvailable() || !this.options) return this.memory;

    if (!this.redisStore) {
      const store = new RedisStore({
        prefix: this.prefix,
        sendCommand: (...args: string[]) =>
          client.call(...(args as [string, ...string[]])) as Promise<never>,
      });
      // Awaited only on first use; if Redis drops before then, that must not surface
      // as an unhandled rejection.
      store.incrementScriptSha.catch(() => undefined);
      store.getScriptSha.catch(() => undefined);
      store.init(this.options);
      this.redisStore = store;
      logger.info({ limiter: this.name }, 'Rate limits stored in Redis');
    }
    return this.redisStore;
  }

  private async run<T>(operation: (store: Store) => Promise<T>): Promise<T> {
    const store = this.current();
    if (store === this.memory) return operation(store);

    try {
      return await operation(store);
    } catch (error) {
      logger.warn(
        { err: error, limiter: this.name },
        'Redis rate-limit store failed — counting in memory',
      );
      return operation(this.memory);
    }
  }

  increment(key: string): Promise<ClientRateLimitInfo> {
    return this.run(async (store) => store.increment(key));
  }

  decrement(key: string): Promise<void> {
    return this.run(async (store) => {
      await store.decrement(key);
    });
  }

  resetKey(key: string): Promise<void> {
    return this.run(async (store) => {
      await store.resetKey(key);
    });
  }
}

function build(options: {
  windowMs: number;
  max: number;
  prefix: string;
  message: string;
  keyGenerator?: (req: Request) => string;
  skipSuccessfulRequests?: boolean;
}): RateLimitRequestHandler {
  return rateLimit({
    windowMs: options.windowMs,
    max: options.max,
    standardHeaders: true,
    legacyHeaders: false,
    store: new FallbackStore(options.prefix),
    skipSuccessfulRequests: options.skipSuccessfulRequests ?? false,
    // Disabled in tests so suites don't trip limits and become order-dependent.
    skip: () => isTest,
    ...(options.keyGenerator ? { keyGenerator: options.keyGenerator } : {}),
    handler: (_req: Request, res: Response) => {
      res.status(429).json({
        success: false,
        message: options.message,
        code: ErrorCode.RATE_LIMITED,
      });
    },
  });
}

/** Broad ceiling applied to the whole API. */
export const globalLimiter = build({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  max: env.RATE_LIMIT_MAX,
  prefix: 'global',
  message: 'Too many requests. Please slow down and try again shortly.',
});

/**
 * Credential endpoints. Keyed on IP + email so one attacker cannot lock out a victim's
 * account by spraying their address, and `skipSuccessfulRequests` means normal users
 * who log in correctly never consume budget.
 */
export const authLimiter = build({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  max: env.AUTH_RATE_LIMIT_MAX,
  prefix: 'auth',
  message: 'Too many authentication attempts. Please try again in a few minutes.',
  skipSuccessfulRequests: true,
  keyGenerator: (req) => {
    const body = req.body as { email?: unknown } | undefined;
    const email = typeof body?.email === 'string' ? body.email.toLowerCase() : 'anonymous';
    return `${req.ip ?? 'unknown'}:${email}`;
  },
});

/**
 * The OAuth redirect legs. Keyed on IP by default, because a redirect carries no email
 * to key on, and given a headroom above `authLimiter`: one sign-in costs two requests
 * here, and a user bouncing off the consent screen retries more than they mistype.
 */
export const oauthLimiter = build({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  max: env.AUTH_RATE_LIMIT_MAX * 3,
  prefix: 'oauth',
  message: 'Too many sign-in attempts. Please try again in a few minutes.',
});

/** Password reset and verification resends — strict, since each one sends an email. */
export const sensitiveLimiter = build({
  windowMs: 60 * 60 * 1000,
  max: 5,
  prefix: 'sensitive',
  message: 'Too many requests for this action. Please try again in an hour.',
});

/** Writes are cheaper to abuse than reads; keep a separate, tighter budget. */
export const writeLimiter = build({
  windowMs: 60 * 1000,
  max: 60,
  prefix: 'write',
  message: 'Too many write requests. Please slow down.',
});

export const uploadLimiter = build({
  windowMs: 60 * 60 * 1000,
  max: 100,
  prefix: 'upload',
  message: 'Upload limit reached. Please try again later.',
});

export const checkoutLimiter = build({
  windowMs: 10 * 60 * 1000,
  max: 20,
  prefix: 'checkout',
  message: 'Too many checkout attempts. Please wait a moment.',
});
