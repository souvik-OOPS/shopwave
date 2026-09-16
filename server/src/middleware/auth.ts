import type { NextFunction, Request, Response } from 'express';
import type { Role } from '@prisma/client';

import { AUTH } from '@/config/constants';
import { prisma } from '@/lib/prisma';
import { ApiError, ErrorCode } from '@/utils/ApiError';
import { verifyAccessToken } from '@/utils/tokens';

/** Cookie first (the browser flow), Bearer second (scripts, tests, mobile). */
function extractToken(req: Request): string | null {
  const cookies = req.cookies as Record<string, string | undefined> | undefined;
  const fromCookie = cookies?.[AUTH.ACCESS_COOKIE];
  if (fromCookie) return fromCookie;

  const header = req.headers.authorization;
  if (header?.startsWith('Bearer ')) return header.slice(7);

  return null;
}

/**
 * Verifies the access token and confirms the account is still usable.
 *
 * The DB round-trip is deliberate: a stateless JWT check alone would keep a banned
 * user or a stale role valid for the full 15-minute token lifetime.
 */
export async function requireAuth(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    const token = extractToken(req);
    if (!token) {
      throw ApiError.unauthorized('Authentication required');
    }

    const payload = verifyAccessToken(token);

    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, email: true, role: true, isActive: true, tokenVersion: true },
    });

    if (!user) throw ApiError.unauthorized('Account no longer exists', ErrorCode.TOKEN_INVALID);
    if (!user.isActive) throw ApiError.forbidden('This account has been disabled', ErrorCode.ACCOUNT_DISABLED);
    if (user.tokenVersion !== payload.tv) {
      throw ApiError.unauthorized('Session is no longer valid', ErrorCode.TOKEN_INVALID);
    }

    req.user = {
      id: user.id,
      email: user.email,
      role: user.role,
      tokenVersion: user.tokenVersion,
    };
    next();
  } catch (error) {
    next(error);
  }
}

/**
 * Attaches `req.user` when a valid token is present, but never rejects. Used by
 * endpoints whose response is richer for signed-in users (e.g. product detail
 * showing whether the viewer already reviewed it).
 */
export async function optionalAuth(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    const token = extractToken(req);
    if (!token) return next();

    const payload = verifyAccessToken(token);
    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, email: true, role: true, isActive: true, tokenVersion: true },
    });

    if (user?.isActive && user.tokenVersion === payload.tv) {
      req.user = { id: user.id, email: user.email, role: user.role, tokenVersion: user.tokenVersion };
    }
    return next();
  } catch {
    // An expired or malformed token is simply "not signed in" on these routes.
    return next();
  }
}

/**
 * Role gate. Roles are listed explicitly per route — ADMIN does not silently inherit
 * STAFF permissions, because "admin can do everything" is how privilege creep starts.
 */
export function requireRole(...roles: Role[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      next(ApiError.unauthorized('Authentication required'));
      return;
    }
    if (!roles.includes(req.user.role)) {
      next(ApiError.forbidden('You do not have permission to perform this action'));
      return;
    }
    next();
  };
}

/** Blocks actions that require a confirmed email address. */
export async function requireVerifiedEmail(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.user) throw ApiError.unauthorized('Authentication required');

    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: { emailVerified: true },
    });

    if (!user?.emailVerified) {
      throw ApiError.forbidden('Please verify your email address first', ErrorCode.EMAIL_NOT_VERIFIED);
    }
    next();
  } catch (error) {
    next(error);
  }
}
