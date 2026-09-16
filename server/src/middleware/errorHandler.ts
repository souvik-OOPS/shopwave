import { Prisma } from '@prisma/client';
import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';

import { isProduction } from '@/config/env';
import { logger } from '@/lib/logger';
import { ApiError, ErrorCode, type ErrorCodeValue, type FieldError } from '@/utils/ApiError';

interface ErrorBody {
  success: false;
  message: string;
  code: ErrorCodeValue;
  errors?: FieldError[];
  stack?: string;
}

/** Terminal 404 for unmatched routes — reached only if no route claimed the request. */
export function notFoundHandler(req: Request, _res: Response, next: NextFunction): void {
  next(ApiError.notFound(`Route ${req.method} ${req.originalUrl} not found`));
}

function translatePrismaError(error: Prisma.PrismaClientKnownRequestError): ApiError {
  const target = (error.meta?.target as string[] | string | undefined) ?? [];
  const fields = Array.isArray(target) ? target.join(', ') : String(target);

  switch (error.code) {
    case 'P2002':
      return ApiError.conflict(
        fields ? `A record with this ${fields} already exists` : 'This record already exists',
        ErrorCode.CONFLICT,
        { fields },
      );
    case 'P2025':
      return ApiError.notFound('The requested record was not found');
    case 'P2003':
      return ApiError.badRequest('Related record does not exist', ErrorCode.BAD_REQUEST);
    case 'P2014':
      return ApiError.conflict('This change would break a required relation');
    default:
      return ApiError.internal('Database request failed', { prismaCode: error.code });
  }
}

function normalise(error: unknown): ApiError {
  if (error instanceof ApiError) return error;

  if (error instanceof ZodError) {
    return ApiError.unprocessable(
      'Validation failed',
      ErrorCode.VALIDATION_ERROR,
      error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    );
  }

  if (error instanceof Prisma.PrismaClientKnownRequestError) return translatePrismaError(error);
  if (error instanceof Prisma.PrismaClientValidationError) {
    return ApiError.badRequest('Invalid data supplied to the database layer');
  }
  if (error instanceof Prisma.PrismaClientInitializationError) {
    return ApiError.serviceUnavailable('Database is unavailable');
  }

  // body-parser surfaces these as plain Errors with a `type`/`status` bolted on.
  if (typeof error === 'object' && error !== null) {
    const candidate = error as { type?: string; status?: number; message?: string };
    if (candidate.type === 'entity.too.large') {
      return new ApiError(413, 'Request body is too large', ErrorCode.PAYLOAD_TOO_LARGE);
    }
    if (candidate.type === 'entity.parse.failed') {
      return ApiError.badRequest('Malformed JSON in request body');
    }
  }

  return ApiError.internal(error instanceof Error ? error.message : 'Unexpected error');
}

/**
 * The single place an error becomes an HTTP response.
 *
 * Two rules: the body shape is always `{ success, message, code }`, and a non-operational
 * error (i.e. a bug) never leaks its message or stack to a production client.
 */
export function errorHandler(error: unknown, req: Request, res: Response, next: NextFunction): void {
  if (res.headersSent) {
    next(error);
    return;
  }

  const apiError = normalise(error);

  const logPayload = {
    err: error,
    code: apiError.code,
    statusCode: apiError.statusCode,
    method: req.method,
    url: req.originalUrl,
    userId: req.user?.id,
  };

  if (apiError.statusCode >= 500) {
    logger.error(logPayload, apiError.message);
  } else {
    logger.warn(logPayload, apiError.message);
  }

  const leaksInternals = apiError.statusCode >= 500 || !apiError.isOperational;

  const body: ErrorBody = {
    success: false,
    message: isProduction && leaksInternals ? 'Something went wrong. Please try again.' : apiError.message,
    code: apiError.code,
  };

  if (apiError.errors?.length) body.errors = apiError.errors;
  if (!isProduction && error instanceof Error && error.stack) body.stack = error.stack;

  res.status(apiError.statusCode).json(body);
}
