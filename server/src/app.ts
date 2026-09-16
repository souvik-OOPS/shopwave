import express, { type Application, type Request, type Response } from 'express';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import pinoHttp from 'pino-http';

import { env, isTest } from '@/config/env';
import { logger } from '@/lib/logger';
import { pingDatabase } from '@/lib/prisma';
import { isCacheAvailable } from '@/lib/redis';
import { errorHandler, notFoundHandler } from '@/middleware/errorHandler';
import { globalLimiter } from '@/middleware/rateLimit';
import { corsMiddleware, requestId, sanitiseRequest, securityHeaders } from '@/middleware/security';
import routes from '@/routes';
import { sendSuccess } from '@/utils/response';

export function createApp(): Application {
  const app = express();

  // Behind a load balancer, req.ip must come from X-Forwarded-For or every client
  // shares one rate-limit bucket. `1` = trust exactly one proxy hop.
  app.set('trust proxy', 1);
  app.disable('x-powered-by');

  app.use(requestId);
  app.use(securityHeaders);
  app.use(corsMiddleware);
  app.use(compression());

  if (!isTest) {
    app.use(
      pinoHttp({
        logger,
        genReqId: (req) => (req as Request).id ?? '',
        autoLogging: { ignore: (req) => req.url === '/health' || req.url === '/api/health' },
        customLogLevel: (_req, res, err) => {
          if (err || res.statusCode >= 500) return 'error';
          if (res.statusCode >= 400) return 'warn';
          return 'info';
        },
      }),
    );
  }

  /**
   * The Razorpay webhook signature is computed over the exact bytes Razorpay sent, so
   * the raw buffer is captured before JSON.parse can normalise it away.
   */
  app.use(
    express.json({
      limit: env.MAX_REQUEST_BODY_SIZE,
      verify: (req, _res, buffer) => {
        (req as Request).rawBody = Buffer.from(buffer);
      },
    }),
  );
  app.use(express.urlencoded({ extended: true, limit: env.MAX_REQUEST_BODY_SIZE }));
  app.use(cookieParser());
  app.use(sanitiseRequest);

  app.use(env.API_PREFIX, globalLimiter);

  app.get('/health', async (_req: Request, res: Response) => {
    const database = await pingDatabase();
    return sendSuccess(
      res,
      {
        status: database ? 'ok' : 'degraded',
        database: database ? 'up' : 'down',
        cache: isCacheAvailable() ? 'up' : 'disabled',
        uptime: Math.round(process.uptime()),
        environment: env.NODE_ENV,
        timestamp: new Date().toISOString(),
      },
      { status: database ? 200 : 503 },
    );
  });

  app.use(env.API_PREFIX, routes);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
