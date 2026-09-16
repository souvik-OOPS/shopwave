import { randomUUID } from 'node:crypto';

import cors, { type CorsOptions } from 'cors';
import helmet from 'helmet';
import type { NextFunction, Request, RequestHandler, Response } from 'express';

import { corsOrigins, isProduction } from '@/config/env';
import { ApiError } from '@/utils/ApiError';

/**
 * Helmet defaults plus a CSP tuned for an API that also serves Razorpay's checkout
 * script in dev. `crossOriginResourcePolicy` is relaxed so the SPA on a different
 * origin can read responses.
 */
export const securityHeaders: RequestHandler = helmet({
  contentSecurityPolicy: isProduction
    ? {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'", 'https://checkout.razorpay.com'],
          frameSrc: ["'self'", 'https://api.razorpay.com', 'https://checkout.razorpay.com'],
          imgSrc: ["'self'", 'data:', 'https://res.cloudinary.com'],
          connectSrc: ["'self'", 'https://api.razorpay.com'],
          styleSrc: ["'self'", "'unsafe-inline'"],
          objectSrc: ["'none'"],
          upgradeInsecureRequests: [],
        },
      }
    : false,
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  crossOriginEmbedderPolicy: false,
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
});

/**
 * Credentialed CORS: the browser sends auth cookies, so the origin must be an exact
 * match from the allow-list. A wildcard is not permitted with credentials, and
 * reflecting an arbitrary Origin header would defeat the point entirely.
 */
const corsOptions: CorsOptions = {
  origin(origin, callback) {
    // Same-origin requests, curl and server-to-server calls send no Origin header.
    if (!origin) return callback(null, true);
    if (corsOrigins.includes(origin)) return callback(null, true);
    return callback(new ApiError(403, `Origin ${origin} is not allowed by CORS`));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'X-Razorpay-Signature'],
  exposedHeaders: ['RateLimit-Limit', 'RateLimit-Remaining', 'RateLimit-Reset'],
  maxAge: 86400,
};

export const corsMiddleware = cors(corsOptions);

/** Correlation id echoed on every response so a client error maps to a server log line. */
export function requestId(req: Request, res: Response, next: NextFunction): void {
  const incoming = req.headers['x-request-id'];
  const id = typeof incoming === 'string' && incoming.length <= 100 ? incoming : randomUUID();
  req.id = id;
  res.setHeader('X-Request-Id', id);
  next();
}

/**
 * Strips prototype-pollution vectors from parsed bodies. Zod's whitelisting already
 * blocks these downstream, but removing them at the edge means nothing in the stack
 * ever handles a `__proto__` key.
 */
const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

function sanitiseValue(value: unknown, depth = 0): unknown {
  if (depth > 10 || value === null || typeof value !== 'object') return value;

  if (Array.isArray(value)) return value.map((item) => sanitiseValue(item, depth + 1));

  const result: Record<string, unknown> = {};
  for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
    if (FORBIDDEN_KEYS.has(key)) continue;
    result[key] = sanitiseValue(nested, depth + 1);
  }
  return result;
}

export function sanitiseRequest(req: Request, _res: Response, next: NextFunction): void {
  if (req.body && typeof req.body === 'object') {
    req.body = sanitiseValue(req.body);
  }
  next();
}
