import type { Request, Response } from 'express';

import { AUTH } from '@/config/constants';
import { env } from '@/config/env';
import {
  buildAuthorizationUrl,
  createPkcePair,
  exchangeCodeForProfile,
  generateOAuthState,
  statesMatch,
} from '@/lib/google';
import { logger } from '@/lib/logger';
import { authService, type SessionContext } from '@/services/auth.service';
import type {
  ChangePasswordInput,
  ForgotPasswordInput,
  LoginInput,
  RegisterInput,
  ResetPasswordInput,
  UpdateProfileInput,
  VerifyEmailInput,
} from '@/schemas/auth.schema';
import { ApiError, ErrorCode, type ErrorCodeValue } from '@/utils/ApiError';
import { asyncHandler } from '@/utils/asyncHandler';
import { clearAuthCookies, clearOAuthCookie, setAuthCookies, setOAuthCookie } from '@/utils/cookies';
import { sendCreated, sendSuccess } from '@/utils/response';
import type { AuthenticatedRequest } from '@/types';

function sessionContext(req: Request): SessionContext {
  return {
    ...(req.headers['user-agent'] ? { userAgent: req.headers['user-agent'] } : {}),
    ...(req.ip ? { ipAddress: req.ip } : {}),
  };
}

/**
 * Post-login destination, taken from `?redirect=` and reduced to a single in-app path.
 * Anything absolute, protocol-relative (`//evil.com`) or backslash-prefixed is dropped —
 * an OAuth callback that forwards to an attacker's host is the classic open redirect,
 * and it is worth more here than usual because the user arrives freshly authenticated.
 */
function safeRedirectPath(value: unknown): string {
  if (typeof value !== 'string' || value.length === 0 || value.length > 512) return '/';
  if (!value.startsWith('/')) return '/';
  // `//host` and `/\host` are both read as protocol-relative URLs by browsers.
  if (/^\/[/\\]/.test(value)) return '/';
  return value;
}

/** Browser-facing leg of the OAuth flow: never JSON, always a redirect the user can see. */
function redirectToClient(res: Response, path: string): void {
  res.redirect(new URL(path, env.CLIENT_URL).toString());
}

function redirectWithError(res: Response, code: ErrorCodeValue): void {
  redirectToClient(res, `/login?error=${encodeURIComponent(code)}`);
}

interface OAuthHandshake {
  state: string;
  verifier: string;
  redirect: string;
}

function readHandshake(req: Request): OAuthHandshake | null {
  const cookies = req.cookies as Record<string, string | undefined>;
  const raw = cookies[AUTH.OAUTH_COOKIE];
  if (!raw) return null;

  try {
    const parsed = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8')) as Partial<OAuthHandshake>;
    if (typeof parsed.state !== 'string' || typeof parsed.verifier !== 'string') return null;
    return { state: parsed.state, verifier: parsed.verifier, redirect: safeRedirectPath(parsed.redirect) };
  } catch {
    return null;
  }
}

/**
 * Controllers stay thin on purpose: read validated input, call the service, set cookies,
 * shape the response. Every rule about tokens and passwords lives in the service.
 */
export const authController = {
  register: asyncHandler(async (req: Request, res: Response) => {
    const result = await authService.register(req.body as RegisterInput, sessionContext(req));
    setAuthCookies(res, result.tokens);
    return sendCreated(
      res,
      { user: result.user },
      'Account created. Check your inbox to verify your email.',
    );
  }),

  login: asyncHandler(async (req: Request, res: Response) => {
    const result = await authService.login(req.body as LoginInput, sessionContext(req));
    setAuthCookies(res, result.tokens);
    return sendSuccess(res, { user: result.user }, { message: 'Signed in successfully' });
  }),

  refresh: asyncHandler(async (req: Request, res: Response) => {
    const cookies = req.cookies as Record<string, string | undefined>;
    const token = cookies[AUTH.REFRESH_COOKIE];

    if (!token) {
      clearAuthCookies(res);
      throw ApiError.unauthorized('No active session');
    }

    try {
      const result = await authService.refresh(token, sessionContext(req));
      setAuthCookies(res, result.tokens);
      return sendSuccess(res, { user: result.user });
    } catch (error) {
      // A failed refresh must not leave a stale cookie the client keeps retrying with.
      clearAuthCookies(res);
      throw error;
    }
  }),

  logout: asyncHandler(async (req: Request, res: Response) => {
    const cookies = req.cookies as Record<string, string | undefined>;
    await authService.logout(cookies[AUTH.REFRESH_COOKIE]);
    clearAuthCookies(res);
    return sendSuccess(res, null, { message: 'Signed out' });
  }),

  logoutAll: asyncHandler(async (req: Request, res: Response) => {
    const { user } = req as AuthenticatedRequest;
    await authService.logoutAllSessions(user.id);
    clearAuthCookies(res);
    return sendSuccess(res, null, { message: 'Signed out of all devices' });
  }),

  me: asyncHandler(async (req: Request, res: Response) => {
    const { user } = req as AuthenticatedRequest;
    const profile = await authService.getProfile(user.id);
    return sendSuccess(res, { user: profile });
  }),

  updateProfile: asyncHandler(async (req: Request, res: Response) => {
    const { user } = req as AuthenticatedRequest;
    const updated = await authService.updateProfile(user.id, req.body as UpdateProfileInput);
    return sendSuccess(res, { user: updated }, { message: 'Profile updated' });
  }),

  changePassword: asyncHandler(async (req: Request, res: Response) => {
    const { user } = req as AuthenticatedRequest;
    await authService.changePassword(user.id, req.body as ChangePasswordInput);
    clearAuthCookies(res);
    return sendSuccess(res, null, { message: 'Password changed. Please sign in again.' });
  }),

  forgotPassword: asyncHandler(async (req: Request, res: Response) => {
    await authService.forgotPassword((req.body as ForgotPasswordInput).email);
    // Deliberately identical response whether or not the account exists.
    return sendSuccess(res, null, {
      message: 'If an account exists for that email, a reset link is on its way.',
    });
  }),

  resetPassword: asyncHandler(async (req: Request, res: Response) => {
    const { token, password } = req.body as ResetPasswordInput;
    await authService.resetPassword(token, password);
    clearAuthCookies(res);
    return sendSuccess(res, null, { message: 'Password reset. You can now sign in.' });
  }),

  verifyEmail: asyncHandler(async (req: Request, res: Response) => {
    const user = await authService.verifyEmail((req.body as VerifyEmailInput).token);
    return sendSuccess(res, { user }, { message: 'Email verified' });
  }),

  resendVerification: asyncHandler(async (req: Request, res: Response) => {
    await authService.resendVerification((req.body as ForgotPasswordInput).email);
    return sendSuccess(res, null, {
      message: 'If that account needs verification, a new link is on its way.',
    });
  }),

  // ----- Google OAuth ---------------------------------------------------
  //
  // These two are the only endpoints in the API that answer with a redirect instead of
  // JSON: the browser navigates here directly, so there is no caller to read an envelope.
  // Failures therefore bounce back to /login?error=CODE rather than rendering a 4xx body.

  /**
   * Leg one. Mints a `state` (CSRF) and a PKCE verifier, parks both in a short-lived
   * HTTP-only cookie, and sends the browser to Google's consent screen. The verifier
   * stays server-side for the whole flow — that is what makes a stolen code useless.
   */
  googleStart: asyncHandler(async (req: Request, res: Response) => {
    const state = generateOAuthState();
    const { verifier, challenge } = createPkcePair();
    const redirect = safeRedirectPath(req.query.redirect);

    let authorizationUrl: string;
    try {
      // Built before the cookie is written, so a deployment without credentials leaves
      // no handshake cookie behind for a flow that never started.
      authorizationUrl = buildAuthorizationUrl({ state, codeChallenge: challenge });
    } catch (error) {
      // The shared error handler would render JSON, and this endpoint is a browser
      // navigation — the user would be staring at an error envelope in a blank tab.
      const errorCode = error instanceof ApiError ? error.code : ErrorCode.OAUTH_NOT_CONFIGURED;
      logger.error({ err: error }, 'Google sign-in could not be started');
      return redirectWithError(res, errorCode);
    }

    setOAuthCookie(res, Buffer.from(JSON.stringify({ state, verifier, redirect })).toString('base64url'));

    return res.redirect(authorizationUrl);
  }),

  /**
   * Leg two. Google sends the user back here with a code; everything from the browser
   * is untrusted until `state` matches the cookie we set in leg one.
   */
  googleCallback: asyncHandler(async (req: Request, res: Response) => {
    const handshake = readHandshake(req);
    clearOAuthCookie(res);

    // The user pressed "Cancel", or Google refused. Not an error worth logging loudly.
    if (typeof req.query.error === 'string') {
      logger.info({ error: req.query.error }, 'Google sign-in was not completed');
      return redirectWithError(res, ErrorCode.OAUTH_CANCELLED);
    }

    const code = typeof req.query.code === 'string' ? req.query.code : null;
    const state = typeof req.query.state === 'string' ? req.query.state : null;

    if (!handshake || !code || !state || !statesMatch(handshake.state, state)) {
      // Either a forged callback, or a genuine one that sat past the cookie's TTL.
      logger.warn({ hasHandshake: Boolean(handshake), hasCode: Boolean(code) }, 'Google callback rejected');
      return redirectWithError(res, ErrorCode.OAUTH_STATE_MISMATCH);
    }

    try {
      const profile = await exchangeCodeForProfile({ code, codeVerifier: handshake.verifier });
      const result = await authService.loginWithGoogle(profile, sessionContext(req));

      setAuthCookies(res, result.tokens);
      return redirectToClient(res, handshake.redirect);
    } catch (error) {
      // Google's own diagnostics (redirect_uri_mismatch and friends) are worth a log
      // line; the browser only ever sees the stable code on the query string.
      const errorCode = error instanceof ApiError ? error.code : ErrorCode.OAUTH_EXCHANGE_FAILED;
      logger.error({ err: error }, 'Google sign-in failed');
      return redirectWithError(res, errorCode);
    }
  }),
};
