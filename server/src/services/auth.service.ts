import { AuthProvider, TokenType } from '@prisma/client';

import { AUTH } from '@/config/constants';
import type { GoogleProfile } from '@/lib/google';
import { sendPasswordResetEmail, sendVerificationEmail } from '@/lib/mailer';
import { logger } from '@/lib/logger';
import { prisma } from '@/lib/prisma';
import { userRepository, type PublicUser } from '@/repositories/user.repository';
import type {
  ChangePasswordInput,
  LoginInput,
  RegisterInput,
  UpdateProfileInput,
} from '@/schemas/auth.schema';
import { ApiError, ErrorCode } from '@/utils/ApiError';
import { fakePasswordCompare, hashPassword, verifyPassword } from '@/utils/password';
import {
  generateOneTimeToken,
  generateRefreshToken,
  hashToken,
  newTokenFamily,
  refreshTokenExpiry,
  signAccessToken,
} from '@/utils/tokens';

export interface SessionContext {
  userAgent?: string;
  ipAddress?: string;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

export interface AuthResult {
  user: PublicUser;
  tokens: TokenPair;
}

function toPublicUser(user: {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  avatarUrl: string | null;
  role: PublicUser['role'];
  isActive: boolean;
  emailVerified: boolean;
  createdAt: Date;
}): PublicUser {
  return {
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    phone: user.phone,
    avatarUrl: user.avatarUrl,
    role: user.role,
    isActive: user.isActive,
    emailVerified: user.emailVerified,
    createdAt: user.createdAt,
  };
}

async function issueTokens(
  user: { id: string; email: string; role: PublicUser['role']; tokenVersion: number },
  context: SessionContext,
  familyId = newTokenFamily(),
): Promise<TokenPair> {
  const accessToken = signAccessToken({
    sub: user.id,
    email: user.email,
    role: user.role,
    tv: user.tokenVersion,
  });

  const { token, tokenHash } = generateRefreshToken();

  await userRepository.createRefreshToken({
    userId: user.id,
    tokenHash,
    familyId,
    expiresAt: refreshTokenExpiry(),
    ...(context.userAgent ? { userAgent: context.userAgent.slice(0, 255) } : {}),
    ...(context.ipAddress ? { ipAddress: context.ipAddress } : {}),
  });

  return { accessToken, refreshToken: token };
}

/**
 * Every downstream service assumes a signed-in user owns a cart and a wishlist.
 * Registration creates both, but accounts predating that guarantee — and accounts
 * arriving through a provider — are healed on the way in.
 */
async function ensureCartAndWishlist(userId: string): Promise<void> {
  await prisma.$transaction([
    prisma.cart.upsert({ where: { userId }, create: { userId }, update: {} }),
    prisma.wishlist.upsert({ where: { userId }, create: { userId }, update: {} }),
  ]);
}

async function createAndSendVerification(userId: string, email: string, firstName: string): Promise<void> {
  const { token, tokenHash } = generateOneTimeToken();

  await userRepository.invalidateVerificationTokens(userId, TokenType.EMAIL_VERIFICATION);
  await userRepository.createVerificationToken({
    userId,
    tokenHash,
    type: TokenType.EMAIL_VERIFICATION,
    expiresAt: new Date(Date.now() + AUTH.EMAIL_VERIFICATION_TTL_HOURS * 60 * 60 * 1000),
  });

  await sendVerificationEmail(email, firstName, token);
}

export const authService = {
  /**
   * Registration creates the user together with their cart and wishlist in one
   * transaction — every downstream service can then assume those rows exist.
   */
  async register(input: RegisterInput, context: SessionContext): Promise<AuthResult> {
    if (await userRepository.emailExists(input.email)) {
      throw ApiError.conflict('An account with this email already exists', ErrorCode.EMAIL_ALREADY_EXISTS);
    }

    const passwordHash = await hashPassword(input.password);

    const user = await prisma.$transaction(async (tx) => {
      const created = await userRepository.create(
        {
          email: input.email,
          passwordHash,
          firstName: input.firstName,
          lastName: input.lastName,
          ...(input.phone ? { phone: input.phone } : {}),
          // Role is never taken from the request body — new accounts are always CUSTOMER.
        },
        tx,
      );

      await tx.cart.create({ data: { userId: created.id } });
      await tx.wishlist.create({ data: { userId: created.id } });

      return created;
    });

    await createAndSendVerification(user.id, user.email, user.firstName);

    const tokens = await issueTokens(user, context);
    return { user: toPublicUser(user), tokens };
  },

  async login(input: LoginInput, context: SessionContext): Promise<AuthResult> {
    const user = await userRepository.findByEmail(input.email);

    if (!user) {
      // Equalise timing so a missing account is indistinguishable from a wrong password.
      await fakePasswordCompare();
      throw ApiError.unauthorized('Invalid email or password', ErrorCode.INVALID_CREDENTIALS);
    }

    if (!user.passwordHash) {
      // An OAuth-only account has no password that could ever match. Burn the same
      // time as a real comparison and return the same generic error: answering
      // "this one uses Google" would turn login into an enumeration oracle. The way
      // back in is either the Google button or "forgot password", which sets one.
      await fakePasswordCompare();
      throw ApiError.unauthorized('Invalid email or password', ErrorCode.INVALID_CREDENTIALS);
    }

    const passwordValid = await verifyPassword(input.password, user.passwordHash);
    if (!passwordValid) {
      throw ApiError.unauthorized('Invalid email or password', ErrorCode.INVALID_CREDENTIALS);
    }

    if (!user.isActive) {
      throw ApiError.forbidden('This account has been disabled', ErrorCode.ACCOUNT_DISABLED);
    }

    await ensureCartAndWishlist(user.id);

    const tokens = await issueTokens(user, context);
    await userRepository.touchLastLogin(user.id);

    return { user: toPublicUser(user), tokens };
  },

  /**
   * Google sign-in. Resolution goes provider-id first, email second:
   *
   *   1. A known `(GOOGLE, sub)` pair is simply that user signing in again. `sub` is
   *      used rather than the email because Google users can change their address.
   *   2. An unknown pair whose email already has an account *links* to it, so someone
   *      who registered with a password and later clicks the Google button lands in
   *      their own account instead of a duplicate one. This is only safe because the
   *      caller has already established that Google asserts the address as verified —
   *      without that check, an IdP that let users claim arbitrary emails could take
   *      over any account by address alone.
   *   3. Otherwise a new account is provisioned, already verified and with no password.
   */
  async loginWithGoogle(profile: GoogleProfile, context: SessionContext): Promise<AuthResult> {
    if (!profile.emailVerified) {
      throw ApiError.forbidden(
        'Your Google account has no verified email address',
        ErrorCode.OAUTH_EMAIL_UNVERIFIED,
      );
    }

    const linked = await userRepository.findByProviderAccount(AuthProvider.GOOGLE, profile.googleId);

    let userId: string;

    if (linked) {
      if (!linked.user.isActive) {
        throw ApiError.forbidden('This account has been disabled', ErrorCode.ACCOUNT_DISABLED);
      }
      userId = linked.user.id;
    } else {
      const existing = await userRepository.findByEmail(profile.email);

      if (existing) {
        if (!existing.isActive) {
          throw ApiError.forbidden('This account has been disabled', ErrorCode.ACCOUNT_DISABLED);
        }

        await prisma.$transaction(async (tx) => {
          await userRepository.linkOAuthAccount(
            {
              userId: existing.id,
              provider: AuthProvider.GOOGLE,
              providerAccountId: profile.googleId,
              email: profile.email,
            },
            tx,
          );

          // Google's assertion is at least as strong as our own emailed link, so a
          // pending verification is settled here rather than left hanging.
          if (!existing.emailVerified) {
            await userRepository.markEmailVerified(existing.id, tx);
          }
        });

        logger.info({ userId: existing.id }, 'Linked Google account to existing user');
        userId = existing.id;
      } else {
        const created = await prisma.$transaction(async (tx) => {
          const user = await userRepository.create(
            {
              email: profile.email,
              firstName: profile.firstName,
              lastName: profile.lastName,
              emailVerified: true,
              emailVerifiedAt: new Date(),
              ...(profile.picture ? { avatarUrl: profile.picture } : {}),
              // No passwordHash: this account signs in through Google until its owner
              // sets one via the password-reset flow.
            },
            tx,
          );

          await userRepository.linkOAuthAccount(
            {
              userId: user.id,
              provider: AuthProvider.GOOGLE,
              providerAccountId: profile.googleId,
              email: profile.email,
            },
            tx,
          );

          await tx.cart.create({ data: { userId: user.id } });
          await tx.wishlist.create({ data: { userId: user.id } });

          return user;
        });

        logger.info({ userId: created.id }, 'Provisioned new user from Google sign-in');
        userId = created.id;
      }
    }

    await ensureCartAndWishlist(userId);

    // Re-read rather than trusting the branch above: this is the row the token is
    // signed from, and `tokenVersion` in particular must be current.
    const user = await userRepository.findById(userId);
    if (!user) throw ApiError.notFound('User not found', ErrorCode.USER_NOT_FOUND);

    const tokens = await issueTokens(user, context);
    await userRepository.touchLastLogin(user.id);

    return { user: toPublicUser(user), tokens };
  },

  /**
   * Rotation with reuse detection.
   *
   * A token that is already revoked means someone replayed it — either the legitimate
   * user racing themselves, or an attacker with a stolen cookie. We cannot tell which,
   * so the safe move is to revoke the whole family and force a fresh login.
   */
  async refresh(rawToken: string, context: SessionContext): Promise<AuthResult> {
    const tokenHash = hashToken(rawToken);
    const stored = await userRepository.findRefreshToken(tokenHash);

    if (!stored) {
      throw ApiError.unauthorized('Invalid session', ErrorCode.TOKEN_INVALID);
    }

    if (stored.revokedAt) {
      await userRepository.revokeTokenFamily(stored.userId, stored.familyId);
      logger.warn({ userId: stored.userId, familyId: stored.familyId }, 'Refresh token reuse detected');
      throw ApiError.unauthorized(
        'Session security issue detected. Please sign in again.',
        ErrorCode.REFRESH_TOKEN_REUSED,
      );
    }

    if (stored.expiresAt.getTime() < Date.now()) {
      throw ApiError.unauthorized('Session expired', ErrorCode.TOKEN_EXPIRED);
    }

    if (!stored.user.isActive) {
      throw ApiError.forbidden('This account has been disabled', ErrorCode.ACCOUNT_DISABLED);
    }

    const tokens = await issueTokens(stored.user, context, stored.familyId);
    await userRepository.revokeRefreshToken(stored.id);

    const user = await userRepository.findPublicById(stored.userId);
    if (!user) throw ApiError.unauthorized('Account no longer exists', ErrorCode.TOKEN_INVALID);

    return { user, tokens };
  },

  async logout(rawToken: string | undefined): Promise<void> {
    if (!rawToken) return;
    const stored = await userRepository.findRefreshToken(hashToken(rawToken));
    if (stored && !stored.revokedAt) {
      await userRepository.revokeRefreshToken(stored.id);
    }
  },

  async logoutAllSessions(userId: string): Promise<void> {
    await userRepository.revokeAllUserTokens(userId);
  },

  async getProfile(userId: string): Promise<PublicUser> {
    const user = await userRepository.findPublicById(userId);
    if (!user) throw ApiError.notFound('User not found', ErrorCode.USER_NOT_FOUND);
    return user;
  },

  async updateProfile(userId: string, input: UpdateProfileInput): Promise<PublicUser> {
    return userRepository.update(userId, input);
  },

  /** Changing a password ends every other session, which is the expected behaviour. */
  async changePassword(userId: string, input: ChangePasswordInput): Promise<void> {
    const user = await userRepository.findById(userId);
    if (!user) throw ApiError.notFound('User not found', ErrorCode.USER_NOT_FOUND);

    if (!user.passwordHash) {
      // Safe to be specific: the caller already proved who they are.
      throw ApiError.badRequest(
        'This account signs in with Google. Use "Forgot password" to set a password first.',
        ErrorCode.PASSWORD_NOT_SET,
      );
    }

    const valid = await verifyPassword(input.currentPassword, user.passwordHash);
    if (!valid) {
      throw ApiError.badRequest('Current password is incorrect', ErrorCode.INVALID_CREDENTIALS);
    }

    const passwordHash = await hashPassword(input.newPassword);

    await prisma.$transaction(async (tx) => {
      await userRepository.updatePassword(userId, passwordHash, tx);
      await userRepository.revokeAllUserTokens(userId, tx);
    });
  },

  /**
   * Always resolves successfully, whether or not the address exists. Reporting
   * "no such user" here would turn this endpoint into an account enumeration oracle.
   *
   * This is also how a Google-only account gains a password: `resetPassword` writes
   * `passwordHash` whether or not one was there before.
   */
  async forgotPassword(email: string): Promise<void> {
    const user = await userRepository.findByEmail(email);
    if (!user || !user.isActive) return;

    const { token, tokenHash } = generateOneTimeToken();

    await userRepository.invalidateVerificationTokens(user.id, TokenType.PASSWORD_RESET);
    await userRepository.createVerificationToken({
      userId: user.id,
      tokenHash,
      type: TokenType.PASSWORD_RESET,
      expiresAt: new Date(Date.now() + AUTH.PASSWORD_RESET_TTL_MINUTES * 60 * 1000),
    });

    await sendPasswordResetEmail(user.email, user.firstName, token);
  },

  async resetPassword(rawToken: string, newPassword: string): Promise<void> {
    const record = await userRepository.findVerificationToken(hashToken(rawToken), TokenType.PASSWORD_RESET);

    if (!record || record.usedAt || record.expiresAt.getTime() < Date.now()) {
      throw ApiError.badRequest('This reset link is invalid or has expired', ErrorCode.TOKEN_INVALID);
    }

    const passwordHash = await hashPassword(newPassword);

    await prisma.$transaction(async (tx) => {
      await userRepository.consumeVerificationToken(record.id, tx);
      await userRepository.updatePassword(record.userId, passwordHash, tx);
      await userRepository.revokeAllUserTokens(record.userId, tx);
    });
  },

  async verifyEmail(rawToken: string): Promise<PublicUser> {
    const record = await userRepository.findVerificationToken(
      hashToken(rawToken),
      TokenType.EMAIL_VERIFICATION,
    );

    if (!record || record.usedAt || record.expiresAt.getTime() < Date.now()) {
      throw ApiError.badRequest('This verification link is invalid or has expired', ErrorCode.TOKEN_INVALID);
    }

    await prisma.$transaction(async (tx) => {
      await userRepository.consumeVerificationToken(record.id, tx);
      await userRepository.markEmailVerified(record.userId, tx);
    });

    const user = await userRepository.findPublicById(record.userId);
    if (!user) throw ApiError.notFound('User not found', ErrorCode.USER_NOT_FOUND);
    return user;
  },

  /** Silent no-op for unknown or already-verified addresses, same reasoning as above. */
  async resendVerification(email: string): Promise<void> {
    const user = await userRepository.findByEmail(email);
    if (!user || user.emailVerified || !user.isActive) return;
    await createAndSendVerification(user.id, user.email, user.firstName);
  },
};
