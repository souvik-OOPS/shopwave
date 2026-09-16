import type { Role } from '@prisma/client';
import type { Request } from 'express';

export interface AuthenticatedUser {
  id: string;
  email: string;
  role: Role;
  tokenVersion: number;
}

/** A request that has passed `requireAuth`, so `user` is guaranteed present. */
export interface AuthenticatedRequest extends Request {
  user: AuthenticatedUser;
}

export interface ListResult<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
}

export type SortDirection = 'asc' | 'desc';
