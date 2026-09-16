import rateLimit, { type Options, type RateLimitRequestHandler } from 'express-rate-limit';
import RedisStore from 'rate-limit-redis';
import type { Request, Response } from 'express';

import { env, isTest } from '@/config/env';
import { isCacheAvailable, redis } from '@/lib/redis';
import { ErrorCode } from '@/utils/ApiError';

/**
 * A shared Redis store makes limits hold across replicas; without Redis each instance
 * keeps its own in-memory counter, which is still better than nothing for single-node.
 */
function createStore(prefix: string): Options['store'] | undefined {
  const client = redis;
  if (!isCacheAvailable() || !client) return undefined;

  return new RedisStore({
    prefix: `rl:${prefix}:`,
    sendCommand: (...args: string[]) => client.call(...(args as [string, ...string[]])) as Promise<never>,
  });
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
    store: createStore(options.prefix),
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
