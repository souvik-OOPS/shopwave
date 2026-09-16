import { createHash, randomBytes, randomUUID } from 'node:crypto';

import jwt, { type SignOptions } from 'jsonwebtoken';
import type { Role } from '@prisma/client';

import { env } from '@/config/env';
import { ApiError, ErrorCode } from '@/utils/ApiError';

export interface AccessTokenPayload {
  sub: string;
  email: string;
  role: Role;
  /** Mirrors User.tokenVersion — bumping it invalidates every issued access token. */
  tv: number;
}

export function signAccessToken(payload: AccessTokenPayload): string {
  const options: SignOptions = {
    expiresIn: env.JWT_ACCESS_EXPIRES_IN as SignOptions['expiresIn'],
    issuer: 'shopwave',
    audience: 'shopwave-client',
  };
  return jwt.sign(payload, env.JWT_ACCESS_SECRET, options);
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  try {
    const decoded = jwt.verify(token, env.JWT_ACCESS_SECRET, {
      issuer: 'shopwave',
      audience: 'shopwave-client',
    });

    if (typeof decoded === 'string') {
      throw ApiError.unauthorized('Malformed token', ErrorCode.TOKEN_INVALID);
    }

    return decoded as unknown as AccessTokenPayload;
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      throw ApiError.unauthorized('Session expired', ErrorCode.TOKEN_EXPIRED);
    }
    if (error instanceof ApiError) throw error;
    throw ApiError.unauthorized('Invalid token', ErrorCode.TOKEN_INVALID);
  }
}

/**
 * Refresh tokens are opaque random bytes, not JWTs: they must be revocable, and a
 * self-contained token cannot be revoked without a lookup anyway.
 */
export function generateRefreshToken(): { token: string; tokenHash: string } {
  const token = randomBytes(64).toString('base64url');
  return { token, tokenHash: hashToken(token) };
}

/** Only the hash is persisted, so a database leak does not yield usable sessions. */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** One-time tokens for email verification and password reset. */
export function generateOneTimeToken(): { token: string; tokenHash: string } {
  const token = randomBytes(32).toString('base64url');
  return { token, tokenHash: hashToken(token) };
}

export function newTokenFamily(): string {
  return randomUUID();
}

export function refreshTokenExpiry(): Date {
  return new Date(Date.now() + env.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000);
}
