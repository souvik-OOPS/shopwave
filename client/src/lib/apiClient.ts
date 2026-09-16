import axios, {
  type AxiosError,
  type AxiosInstance,
  type AxiosRequestConfig,
  type InternalAxiosRequestConfig,
} from 'axios';

import type { ApiErrorBody, ApiFieldError, ApiSuccess, PaginationMeta } from '@/types/api';

/**
 * Exported because the Google sign-in flow is a full-page navigation, not an XHR:
 * the browser must leave for the API's redirect endpoint, so that one URL is built
 * by hand rather than going through `http`.
 */
export const API_BASE_URL = (import.meta.env.VITE_API_URL as string | undefined) ?? '/api';

/**
 * A typed error the whole UI can switch on. `code` comes from the server's stable
 * error vocabulary, so components never string-match on human-readable messages.
 */
export class ApiRequestError extends Error {
  readonly status: number;
  readonly code: string;
  readonly fieldErrors: ApiFieldError[];

  constructor(message: string, status: number, code: string, fieldErrors: ApiFieldError[] = []) {
    super(message);
    this.name = 'ApiRequestError';
    this.status = status;
    this.code = code;
    this.fieldErrors = fieldErrors;
  }

  get isNetworkError(): boolean {
    return this.status === 0;
  }

  /** Maps server field errors onto react-hook-form's `setError` shape. */
  toFormErrors(): Record<string, string> {
    return Object.fromEntries(this.fieldErrors.map((error) => [error.path, error.message]));
  }
}

export const api: AxiosInstance = axios.create({
  baseURL: API_BASE_URL,
  // Auth lives in HTTP-only cookies, so every request must carry credentials.
  // There is no token in JS to attach — that is the point of the design.
  withCredentials: true,
  timeout: 30_000,
  headers: { 'Content-Type': 'application/json' },
});

type RetriableConfig = InternalAxiosRequestConfig & { _retried?: boolean };

/**
 * Access tokens live 15 minutes. Rather than making every screen handle expiry, a 401
 * triggers one silent refresh and the original request is replayed.
 *
 * Concurrent 401s share a single refresh promise — without that, ten parallel requests
 * would fire ten refreshes, and rotation would invalidate all but one of them, logging
 * the user out for no reason.
 */
let refreshPromise: Promise<void> | null = null;

/** Set by the store so a failed refresh can clear client auth state. */
let onAuthFailure: (() => void) | null = null;

export function setAuthFailureHandler(handler: () => void): void {
  onAuthFailure = handler;
}

const PUBLIC_AUTH_PATHS = ['/auth/login', '/auth/register', '/auth/refresh', '/auth/forgot-password'];

async function refreshSession(): Promise<void> {
  refreshPromise ??= api
    .post('/auth/refresh')
    .then(() => undefined)
    .finally(() => {
      refreshPromise = null;
    });

  return refreshPromise;
}

api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError<ApiErrorBody>) => {
    const config = error.config as RetriableConfig | undefined;

    if (!error.response) {
      return Promise.reject(
        new ApiRequestError(
          'Cannot reach the server. Check your connection and try again.',
          0,
          'NETWORK_ERROR',
        ),
      );
    }

    const { status, data } = error.response;
    const url = config?.url ?? '';
    const isAuthEndpoint = PUBLIC_AUTH_PATHS.some((path) => url.includes(path));

    if (status === 401 && config && !config._retried && !isAuthEndpoint) {
      config._retried = true;

      try {
        await refreshSession();
        return await api.request(config);
      } catch {
        // The refresh token is gone or was rotated away — this really is a logout.
        onAuthFailure?.();
        return Promise.reject(
          new ApiRequestError('Your session has expired. Please sign in again.', 401, 'TOKEN_EXPIRED'),
        );
      }
    }

    return Promise.reject(
      new ApiRequestError(
        data?.message ?? 'Something went wrong. Please try again.',
        status,
        data?.code ?? 'UNKNOWN_ERROR',
        data?.errors ?? [],
      ),
    );
  },
);

/** Unwraps the `{ success, data }` envelope so callers work with the payload directly. */
export async function request<T>(config: AxiosRequestConfig): Promise<T> {
  const response = await api.request<ApiSuccess<T>>(config);
  return response.data.data;
}

/** Same as `request`, but keeps pagination metadata alongside the payload. */
export async function requestWithMeta<T>(
  config: AxiosRequestConfig,
): Promise<{ data: T; meta?: PaginationMeta }> {
  const response = await api.request<ApiSuccess<T>>(config);
  return { data: response.data.data, meta: response.data.meta };
}

export const http = {
  get: <T>(url: string, config?: AxiosRequestConfig) => request<T>({ ...config, method: 'GET', url }),
  post: <T>(url: string, data?: unknown, config?: AxiosRequestConfig) =>
    request<T>({ ...config, method: 'POST', url, data }),
  patch: <T>(url: string, data?: unknown, config?: AxiosRequestConfig) =>
    request<T>({ ...config, method: 'PATCH', url, data }),
  put: <T>(url: string, data?: unknown, config?: AxiosRequestConfig) =>
    request<T>({ ...config, method: 'PUT', url, data }),
  delete: <T>(url: string, config?: AxiosRequestConfig) => request<T>({ ...config, method: 'DELETE', url }),
};
