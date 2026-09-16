import { PAGINATION } from '@/config/constants';

export interface PaginationParams {
  page: number;
  limit: number;
}

export interface PrismaPagination {
  skip: number;
  take: number;
  page: number;
  limit: number;
}

export function resolvePagination(params: Partial<PaginationParams> = {}): PrismaPagination {
  const page = Math.max(1, Math.trunc(params.page ?? PAGINATION.DEFAULT_PAGE));
  const limit = Math.min(
    PAGINATION.MAX_LIMIT,
    Math.max(1, Math.trunc(params.limit ?? PAGINATION.DEFAULT_LIMIT)),
  );

  return { skip: (page - 1) * limit, take: limit, page, limit };
}
