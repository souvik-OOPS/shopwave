import type { NextFunction, Request, Response } from 'express';
import { ZodError, type ZodTypeAny, type z } from 'zod';

import { ApiError, ErrorCode, type FieldError } from '@/utils/ApiError';

export interface RequestSchemas {
  body?: ZodTypeAny;
  query?: ZodTypeAny;
  params?: ZodTypeAny;
}

function toFieldErrors(error: ZodError, source: keyof RequestSchemas): FieldError[] {
  return error.issues.map((issue) => ({
    path: issue.path.length > 0 ? issue.path.join('.') : source,
    message: issue.message,
  }));
}

/**
 * Validates and **replaces** `req.body` / `req.query` / `req.params` with the parsed
 * result. Replacing is the point: downstream code then sees only whitelisted, coerced
 * fields, which is what stops mass assignment — an extra `role` or `price` in the JSON
 * is dropped by the schema before any service can read it.
 */
export function validate(schemas: RequestSchemas) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    try {
      if (schemas.params) {
        req.params = schemas.params.parse(req.params) as Request['params'];
      }
      if (schemas.query) {
        const parsed = schemas.query.parse(req.query) as Record<string, unknown>;
        // Express 5 makes req.query a getter; defineProperty keeps this portable.
        Object.defineProperty(req, 'query', { value: parsed, writable: true, configurable: true });
      }
      if (schemas.body) {
        // Widened to `unknown` first: Zod's `parse` returns `any`, and assigning that
        // straight onto `req.body` would silently re-introduce an untyped value.
        const parsedBody: unknown = schemas.body.parse(req.body);
        req.body = parsedBody;
      }
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        const source: keyof RequestSchemas = schemas.body ? 'body' : schemas.query ? 'query' : 'params';
        next(
          ApiError.unprocessable(
            'Validation failed',
            ErrorCode.VALIDATION_ERROR,
            toFieldErrors(error, source),
          ),
        );
        return;
      }
      next(error);
    }
  };
}

/** Convenience wrappers for the common single-target cases. */
export const validateBody = (schema: ZodTypeAny) => validate({ body: schema });
export const validateQuery = (schema: ZodTypeAny) => validate({ query: schema });
export const validateParams = (schema: ZodTypeAny) => validate({ params: schema });

export type Validated<T extends ZodTypeAny> = z.infer<T>;
