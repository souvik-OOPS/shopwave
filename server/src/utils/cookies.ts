import type { CookieOptions, Response } from 'express';

import { AUTH } from '@/config/constants';
import { env } from '@/config/env';

/**
 * Auth cookies are HTTP-only so JavaScript — including anything injected via XSS —
 * cannot read them. SameSite blocks the basic CSRF cases; `Secure` is enforced in
 * production by the env schema.
 */
function baseOptions(): CookieOptions {
  return {
    httpOnly: true,
    secure: env.COOKIE_SECURE,
    sameSite: env.COOKIE_SAME_SITE,
    ...(env.COOKIE_DOMAIN ? { domain: env.COOKIE_DOMAIN } : {}),
  };
}

function accessCookieOptions(): CookieOptions {
  return { ...baseOptions(), path: '/', maxAge: 15 * 60 * 1000 };
}

/**
 * The refresh cookie is scoped to /api/auth, so it is not attached to ordinary API
 * calls — it only travels on the handful of requests that actually need it.
 */
function refreshCookieOptions(): CookieOptions {
  return {
    ...baseOptions(),
    path: AUTH.REFRESH_COOKIE_PATH,
    maxAge: env.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000,
  };
}

/**
 * The OAuth handshake cookie is written before the browser leaves for Google and read
 * when Google redirects back. That return trip is a cross-site top-level navigation, so
 * `SameSite=strict` would drop the cookie and break every sign-in — this one cookie
 * therefore ignores `COOKIE_SAME_SITE` and picks the loosest value that still works.
 * `none` requires `Secure`, so it is only used when cookies are already secure.
 */
function oauthCookieOptions(): CookieOptions {
  return {
    httpOnly: true,
    secure: env.COOKIE_SECURE,
    sameSite: env.COOKIE_SAME_SITE === 'none' && env.COOKIE_SECURE ? 'none' : 'lax',
    ...(env.COOKIE_DOMAIN ? { domain: env.COOKIE_DOMAIN } : {}),
    path: AUTH.OAUTH_COOKIE_PATH,
    maxAge: AUTH.OAUTH_TTL_MINUTES * 60 * 1000,
  };
}

/** Holds the CSRF `state` and PKCE verifier for the few minutes the consent screen is up. */
export function setOAuthCookie(res: Response, value: string): void {
  res.cookie(AUTH.OAUTH_COOKIE, value, oauthCookieOptions());
}

/** Always called on the callback, success or failure — the handshake is single-use. */
export function clearOAuthCookie(res: Response): void {
  const { maxAge: _maxAge, ...options } = oauthCookieOptions();
  res.clearCookie(AUTH.OAUTH_COOKIE, options);
}

export function setAuthCookies(res: Response, tokens: { accessToken: string; refreshToken: string }): void {
  res.cookie(AUTH.ACCESS_COOKIE, tokens.accessToken, accessCookieOptions());
  res.cookie(AUTH.REFRESH_COOKIE, tokens.refreshToken, refreshCookieOptions());
}

export function clearAuthCookies(res: Response): void {
  const { maxAge: _accessMaxAge, ...accessOptions } = accessCookieOptions();
  const { maxAge: _refreshMaxAge, ...refreshOptions } = refreshCookieOptions();
  res.clearCookie(AUTH.ACCESS_COOKIE, accessOptions);
  res.clearCookie(AUTH.REFRESH_COOKIE, refreshOptions);
}
