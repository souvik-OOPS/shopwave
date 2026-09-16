import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

import { env, isGoogleAuthConfigured } from '@/config/env';
import { ApiError, ErrorCode } from '@/utils/ApiError';

/**
 * Google sign-in, implemented as a server-side OpenID Connect authorization-code flow
 * with PKCE. The browser never sees a token: Google redirects back to the API, the API
 * trades the code for an ID token over TLS and issues the same `sw_access` / `sw_refresh`
 * cookie pair a password login would. That keeps one session mechanism in the app
 * instead of two, and keeps the client secret on the server where it belongs.
 *
 * Deliberately no SDK — the flow is three HTTPS calls and Node has `fetch`.
 */
const AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';

/** Google issues `iss` with and without the scheme depending on the token vintage. */
const VALID_ISSUERS = new Set(['accounts.google.com', 'https://accounts.google.com']);

/** Identity only. No Gmail, Drive or contacts scope is requested. */
const SCOPES = ['openid', 'email', 'profile'];

export interface PkcePair {
  verifier: string;
  challenge: string;
}

/**
 * PKCE protects the authorization code itself: an attacker who intercepts the code on
 * the redirect cannot redeem it without the verifier, which never leaves this server.
 */
export function createPkcePair(): PkcePair {
  const verifier = randomBytes(32).toString('base64url');
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  return { verifier, challenge };
}

export function generateOAuthState(): string {
  return randomBytes(32).toString('base64url');
}

/** Constant-time compare so the state check cannot be narrowed by timing. */
export function statesMatch(a: string, b: string): boolean {
  const bufferA = Buffer.from(a, 'utf8');
  const bufferB = Buffer.from(b, 'utf8');
  if (bufferA.length !== bufferB.length) return false;
  return timingSafeEqual(bufferA, bufferB);
}

function requireConfig(): { clientId: string; clientSecret: string } {
  if (!isGoogleAuthConfigured || !env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) {
    throw ApiError.serviceUnavailable(
      'Google sign-in is not configured',
      ErrorCode.OAUTH_NOT_CONFIGURED,
    );
  }
  return { clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET };
}

export function buildAuthorizationUrl(params: { state: string; codeChallenge: string }): string {
  const { clientId } = requireConfig();

  const url = new URL(AUTH_ENDPOINT);
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('redirect_uri', env.GOOGLE_REDIRECT_URI);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', SCOPES.join(' '));
  url.searchParams.set('state', params.state);
  url.searchParams.set('code_challenge', params.codeChallenge);
  url.searchParams.set('code_challenge_method', 'S256');
  // No refresh token is wanted: Google is an identity provider here, not an API we
  // call later, so there is nothing to keep alive once the handshake is done.
  url.searchParams.set('access_type', 'online');
  url.searchParams.set('prompt', 'select_account');
  url.searchParams.set('include_granted_scopes', 'true');

  return url.toString();
}

export interface GoogleProfile {
  /** Google's immutable subject id — the only stable join key. */
  googleId: string;
  email: string;
  emailVerified: boolean;
  firstName: string;
  lastName: string;
  picture: string | null;
}

interface IdTokenClaims {
  iss?: string;
  aud?: string;
  sub?: string;
  exp?: number;
  email?: string;
  email_verified?: boolean | string;
  given_name?: string;
  family_name?: string;
  name?: string;
  picture?: string;
}

/**
 * Reads the ID token payload without checking its signature — safe *only* because this
 * token came straight back from Google's token endpoint over an authenticated TLS
 * channel, which OIDC Core §3.1.3.7 explicitly allows. A token arriving any other way
 * (posted by a browser, say) would need full JWKS verification instead.
 */
function decodeIdToken(idToken: string): IdTokenClaims {
  const [, payload] = idToken.split('.');
  if (!payload) {
    throw ApiError.badRequest('Malformed Google ID token', ErrorCode.OAUTH_EXCHANGE_FAILED);
  }

  try {
    return JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as IdTokenClaims;
  } catch {
    throw ApiError.badRequest('Unreadable Google ID token', ErrorCode.OAUTH_EXCHANGE_FAILED);
  }
}

function splitName(claims: IdTokenClaims, email: string): { firstName: string; lastName: string } {
  const given = claims.given_name?.trim();
  const family = claims.family_name?.trim();
  if (given) return { firstName: given.slice(0, 60), lastName: (family ?? '—').slice(0, 60) };

  // Some Workspace accounts return only `name`, and a few return neither.
  const parts = (claims.name ?? '').trim().split(/\s+/).filter(Boolean);
  if (parts.length > 1) {
    return { firstName: parts[0].slice(0, 60), lastName: parts.slice(1).join(' ').slice(0, 60) };
  }
  if (parts.length === 1) return { firstName: parts[0].slice(0, 60), lastName: '—' };

  return { firstName: email.split('@')[0].slice(0, 60), lastName: '—' };
}

/**
 * Trades the one-time authorization code for an ID token, then validates the claims
 * that matter: who issued it, who it was minted for, and whether it is still fresh.
 * `aud` is the one that stops a token issued for someone else's app being replayed here.
 */
export async function exchangeCodeForProfile(params: {
  code: string;
  codeVerifier: string;
}): Promise<GoogleProfile> {
  const { clientId, clientSecret } = requireConfig();

  let response: Response;
  try {
    response = await fetch(TOKEN_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        code: params.code,
        code_verifier: params.codeVerifier,
        grant_type: 'authorization_code',
        redirect_uri: env.GOOGLE_REDIRECT_URI,
      }),
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    throw new ApiError(502, 'Could not reach Google to complete sign-in', ErrorCode.OAUTH_EXCHANGE_FAILED);
  }

  if (!response.ok) {
    // Google's error body names the misconfiguration (redirect_uri_mismatch and friends);
    // it is logged by the caller, never returned to the browser.
    const detail = await response.text().catch(() => '');
    throw new ApiError(502, 'Google rejected the sign-in attempt', ErrorCode.OAUTH_EXCHANGE_FAILED, {
      details: { status: response.status, body: detail.slice(0, 500) },
    });
  }

  const body = (await response.json()) as { id_token?: string };
  if (!body.id_token) {
    throw new ApiError(502, 'Google returned no identity token', ErrorCode.OAUTH_EXCHANGE_FAILED);
  }

  const claims = decodeIdToken(body.id_token);

  if (!claims.iss || !VALID_ISSUERS.has(claims.iss)) {
    throw ApiError.unauthorized('Unexpected token issuer', ErrorCode.OAUTH_EXCHANGE_FAILED);
  }
  if (claims.aud !== clientId) {
    throw ApiError.unauthorized('Token was not issued for this application', ErrorCode.OAUTH_EXCHANGE_FAILED);
  }
  if (typeof claims.exp !== 'number' || claims.exp * 1000 <= Date.now()) {
    throw ApiError.unauthorized('Google identity token has expired', ErrorCode.OAUTH_EXCHANGE_FAILED);
  }
  if (!claims.sub || !claims.email) {
    throw ApiError.unauthorized('Google identity token is missing an account id', ErrorCode.OAUTH_EXCHANGE_FAILED);
  }

  const email = claims.email.toLowerCase();
  const emailVerified = claims.email_verified === true || claims.email_verified === 'true';

  return {
    googleId: claims.sub,
    email,
    emailVerified,
    ...splitName(claims, email),
    picture: claims.picture ?? null,
  };
}

export { isGoogleAuthConfigured };
