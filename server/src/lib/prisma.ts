import { PrismaClient } from '@prisma/client';

import { isDevelopment, isProduction } from '@/config/env';
import { logger } from '@/lib/logger';

/**
 * A single PrismaClient for the process. In dev the module is re-evaluated on every
 * hot reload, which would otherwise leak a connection pool per reload.
 */
function createPrismaClient() {
  // The log definitions must be a literal (not a ternary) for Prisma to infer the
  // event map — otherwise `$on('query', …)` degrades to `never`.
  return new PrismaClient({
    log: [
      { emit: 'event', level: 'query' },
      { emit: 'event', level: 'warn' },
      { emit: 'event', level: 'error' },
    ],
  });
}

type AppPrismaClient = ReturnType<typeof createPrismaClient>;

const globalForPrisma = globalThis as unknown as { prisma?: AppPrismaClient };

export const prisma: AppPrismaClient = globalForPrisma.prisma ?? createPrismaClient();

if (isDevelopment) {
  globalForPrisma.prisma = prisma;

  prisma.$on('query', (event) => {
    // Only surface genuinely slow queries; a full query log drowns the dev console.
    if (event.duration > 200) {
      logger.debug({ duration: event.duration, query: event.query }, 'slow query');
    }
  });
}

prisma.$on('warn', (event) => logger.warn({ target: event.target }, event.message));
prisma.$on('error', (event) => logger.error({ target: event.target }, event.message));

export async function connectDatabase(): Promise<void> {
  await prisma.$connect();
  logger.info('Database connected');
}

export async function disconnectDatabase(): Promise<void> {
  await prisma.$disconnect();
  logger.info('Database disconnected');
}

/** Liveness probe used by /health — cheap enough to call frequently. */
export async function pingDatabase(): Promise<boolean> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch (error) {
    if (!isProduction) logger.error({ err: error }, 'Database ping failed');
    return false;
  }
}

/** The transaction-scoped client type, so services can accept either. */
export type PrismaTransactionClient = Omit<
  PrismaClient,
  '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'
>;
