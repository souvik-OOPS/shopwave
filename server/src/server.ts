import type { Server } from 'node:http';

import { createApp } from '@/app';
import { env } from '@/config/env';
import { logger } from '@/lib/logger';
import { closeMailTransport, verifyMailTransport } from '@/lib/mailer';
import { connectDatabase, disconnectDatabase } from '@/lib/prisma';
import { disconnectRedis } from '@/lib/redis';

let server: Server | undefined;

async function shutdown(signal: string, exitCode = 0): Promise<void> {
  logger.info({ signal }, 'Shutting down');

  const forceExit = setTimeout(() => {
    logger.error('Graceful shutdown timed out — forcing exit');
    process.exit(1);
  }, 10_000);
  forceExit.unref();

  try {
    // Stop accepting new connections first, then let in-flight requests finish.
    if (server) {
      await new Promise<void>((resolve, reject) => {
        server?.close((error) => (error ? reject(error) : resolve()));
      });
    }
    closeMailTransport();
    await disconnectRedis();
    await disconnectDatabase();
    clearTimeout(forceExit);
    process.exit(exitCode);
  } catch (error) {
    logger.error({ err: error }, 'Error during shutdown');
    process.exit(1);
  }
}

async function bootstrap(): Promise<void> {
  await connectDatabase();

  const app = createApp();

  // Fire-and-forget: a dead relay logs an error but must never delay or block listening.
  void verifyMailTransport();

  server = app.listen(env.PORT, () => {
    logger.info(
      { port: env.PORT, env: env.NODE_ENV, prefix: env.API_PREFIX },
      `ShopWave API listening on http://localhost:${env.PORT}${env.API_PREFIX}`,
    );
  });

  server.on('error', (error: NodeJS.ErrnoException) => {
    if (error.code === 'EADDRINUSE') {
      logger.fatal(`Port ${env.PORT} is already in use`);
      process.exit(1);
    }
    logger.fatal({ err: error }, 'HTTP server error');
    process.exit(1);
  });
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));

process.on('unhandledRejection', (reason) => {
  logger.fatal({ err: reason }, 'Unhandled promise rejection');
  void shutdown('unhandledRejection', 1);
});

process.on('uncaughtException', (error) => {
  logger.fatal({ err: error }, 'Uncaught exception');
  void shutdown('uncaughtException', 1);
});

bootstrap().catch((error: unknown) => {
  logger.fatal({ err: error }, 'Failed to start server');
  process.exit(1);
});
