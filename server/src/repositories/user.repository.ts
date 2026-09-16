import { type AuthProvider, type Prisma, type Role, type TokenType, type User } from '@prisma/client';

import { prisma } from '@/lib/prisma';
import type { PrismaTransactionClient } from '@/lib/prisma';

/**
 * The shape sent to clients. `passwordHash` and `tokenVersion` are absent by
 * construction, so no controller can leak them by forgetting to strip fields.
 */
export const publicUserSelect = {
  id: true,
  email: true,
  firstName: true,
  lastName: true,
  phone: true,
  avatarUrl: true,
  role: true,
  isActive: true,
  emailVerified: true,
  createdAt: true,
} satisfies Prisma.UserSelect;

export type PublicUser = Prisma.UserGetPayload<{ select: typeof publicUserSelect }>;

export const userRepository = {
  findById(id: string): Promise<User | null> {
    return prisma.user.findUnique({ where: { id } });
  },

  findPublicById(id: string): Promise<PublicUser | null> {
    return prisma.user.findUnique({ where: { id }, select: publicUserSelect });
  },

  findByEmail(email: string): Promise<User | null> {
    return prisma.user.findUnique({ where: { email: email.toLowerCase() } });
  },

  emailExists(email: string): Promise<boolean> {
    return prisma.user
      .count({ where: { email: email.toLowerCase() } })
      .then((count) => count > 0);
  },

  create(
    data: {
      email: string;
      /** Absent for OAuth-only accounts, which have nothing to hash. */
      passwordHash?: string;
      firstName: string;
      lastName: string;
      phone?: string;
      avatarUrl?: string;
      emailVerified?: boolean;
      emailVerifiedAt?: Date;
      role?: Role;
    },
    client: PrismaTransactionClient = prisma,
  ): Promise<User> {
    return client.user.create({
      data: { ...data, email: data.email.toLowerCase() },
    });
  },

  update(id: string, data: Prisma.UserUpdateInput): Promise<PublicUser> {
    return prisma.user.update({ where: { id }, data, select: publicUserSelect });
  },

  updatePassword(id: string, passwordHash: string, client: PrismaTransactionClient = prisma): Promise<User> {
    // Bumping tokenVersion invalidates every access token already in the wild.
    return client.user.update({
      where: { id },
      data: { passwordHash, tokenVersion: { increment: 1 } },
    });
  },

  markEmailVerified(id: string, client: PrismaTransactionClient = prisma): Promise<User> {
    return client.user.update({
      where: { id },
      data: { emailVerified: true, emailVerifiedAt: new Date() },
    });
  },

  touchLastLogin(id: string): Promise<User> {
    return prisma.user.update({ where: { id }, data: { lastLoginAt: new Date() } });
  },

  // ----- oauth accounts -------------------------------------------------

  /** The provider's subject id is the join key, so a user changing their Google email still matches. */
  findByProviderAccount(provider: AuthProvider, providerAccountId: string) {
    return prisma.oAuthAccount.findUnique({
      where: { provider_providerAccountId: { provider, providerAccountId } },
      include: {
        user: {
          select: { id: true, email: true, role: true, isActive: true, tokenVersion: true, firstName: true },
        },
      },
    });
  },

  linkOAuthAccount(
    data: { userId: string; provider: AuthProvider; providerAccountId: string; email?: string },
    client: PrismaTransactionClient = prisma,
  ) {
    return client.oAuthAccount.create({ data });
  },

  listOAuthProviders(userId: string): Promise<AuthProvider[]> {
    return prisma.oAuthAccount
      .findMany({ where: { userId }, select: { provider: true } })
      .then((rows) => rows.map((row) => row.provider));
  },

  // ----- refresh tokens -------------------------------------------------

  createRefreshToken(
    data: {
      userId: string;
      tokenHash: string;
      familyId: string;
      expiresAt: Date;
      userAgent?: string;
      ipAddress?: string;
    },
    client: PrismaTransactionClient = prisma,
  ) {
    return client.refreshToken.create({ data });
  },

  findRefreshToken(tokenHash: string) {
    return prisma.refreshToken.findUnique({
      where: { tokenHash },
      include: { user: { select: { id: true, email: true, role: true, isActive: true, tokenVersion: true } } },
    });
  },

  revokeRefreshToken(id: string, replacedById?: string, client: PrismaTransactionClient = prisma) {
    return client.refreshToken.update({
      where: { id },
      data: { revokedAt: new Date(), ...(replacedById ? { replacedById } : {}) },
    });
  },

  /** Reuse detection: one replayed token invalidates the entire rotation family. */
  revokeTokenFamily(userId: string, familyId: string, client: PrismaTransactionClient = prisma) {
    return client.refreshToken.updateMany({
      where: { userId, familyId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  },

  revokeAllUserTokens(userId: string, client: PrismaTransactionClient = prisma) {
    return client.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  },

  deleteExpiredRefreshTokens() {
    return prisma.refreshToken.deleteMany({ where: { expiresAt: { lt: new Date() } } });
  },

  // ----- one-time tokens ------------------------------------------------

  createVerificationToken(
    data: { userId: string; tokenHash: string; type: TokenType; expiresAt: Date },
    client: PrismaTransactionClient = prisma,
  ) {
    return client.verificationToken.create({ data });
  },

  findVerificationToken(tokenHash: string, type: TokenType) {
    return prisma.verificationToken.findFirst({
      where: { tokenHash, type },
      include: { user: true },
    });
  },

  consumeVerificationToken(id: string, client: PrismaTransactionClient = prisma) {
    return client.verificationToken.update({ where: { id }, data: { usedAt: new Date() } });
  },

  /** Superseded tokens are burned so only the newest link in an inbox works. */
  invalidateVerificationTokens(userId: string, type: TokenType, client: PrismaTransactionClient = prisma) {
    return client.verificationToken.updateMany({
      where: { userId, type, usedAt: null },
      data: { usedAt: new Date() },
    });
  },
};
