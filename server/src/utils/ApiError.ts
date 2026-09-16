/**
 * Stable, machine-readable error codes. The client switches on these, never on message text.
 */
export const ErrorCode = {
  // generic
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  NOT_FOUND: 'NOT_FOUND',
  BAD_REQUEST: 'BAD_REQUEST',
  CONFLICT: 'CONFLICT',
  RATE_LIMITED: 'RATE_LIMITED',
  PAYLOAD_TOO_LARGE: 'PAYLOAD_TOO_LARGE',
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',

  // auth
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
  TOKEN_EXPIRED: 'TOKEN_EXPIRED',
  TOKEN_INVALID: 'TOKEN_INVALID',
  REFRESH_TOKEN_REUSED: 'REFRESH_TOKEN_REUSED',
  EMAIL_ALREADY_EXISTS: 'EMAIL_ALREADY_EXISTS',
  EMAIL_NOT_VERIFIED: 'EMAIL_NOT_VERIFIED',
  ACCOUNT_DISABLED: 'ACCOUNT_DISABLED',
  PASSWORD_NOT_SET: 'PASSWORD_NOT_SET',

  // oauth
  OAUTH_NOT_CONFIGURED: 'OAUTH_NOT_CONFIGURED',
  OAUTH_STATE_MISMATCH: 'OAUTH_STATE_MISMATCH',
  OAUTH_EXCHANGE_FAILED: 'OAUTH_EXCHANGE_FAILED',
  OAUTH_EMAIL_UNVERIFIED: 'OAUTH_EMAIL_UNVERIFIED',
  OAUTH_CANCELLED: 'OAUTH_CANCELLED',

  // catalog
  PRODUCT_NOT_FOUND: 'PRODUCT_NOT_FOUND',
  CATEGORY_NOT_FOUND: 'CATEGORY_NOT_FOUND',
  BRAND_NOT_FOUND: 'BRAND_NOT_FOUND',
  VARIANT_NOT_FOUND: 'VARIANT_NOT_FOUND',
  SLUG_ALREADY_EXISTS: 'SLUG_ALREADY_EXISTS',
  SKU_ALREADY_EXISTS: 'SKU_ALREADY_EXISTS',
  CATEGORY_HAS_PRODUCTS: 'CATEGORY_HAS_PRODUCTS',

  // cart / stock
  CART_EMPTY: 'CART_EMPTY',
  CART_ITEM_NOT_FOUND: 'CART_ITEM_NOT_FOUND',
  CART_ALREADY_CHECKED_OUT: 'CART_ALREADY_CHECKED_OUT',
  INSUFFICIENT_STOCK: 'INSUFFICIENT_STOCK',
  OUT_OF_STOCK: 'OUT_OF_STOCK',
  MAX_QUANTITY_EXCEEDED: 'MAX_QUANTITY_EXCEEDED',
  PRODUCT_UNAVAILABLE: 'PRODUCT_UNAVAILABLE',

  // address
  ADDRESS_NOT_FOUND: 'ADDRESS_NOT_FOUND',

  // orders
  ORDER_NOT_FOUND: 'ORDER_NOT_FOUND',
  ORDER_NOT_CANCELLABLE: 'ORDER_NOT_CANCELLABLE',
  ORDER_NOT_RETURNABLE: 'ORDER_NOT_RETURNABLE',
  INVALID_STATUS_TRANSITION: 'INVALID_STATUS_TRANSITION',
  ORDER_ALREADY_PAID: 'ORDER_ALREADY_PAID',
  REFUND_REQUIRES_GATEWAY: 'REFUND_REQUIRES_GATEWAY',

  // payments
  PAYMENT_NOT_FOUND: 'PAYMENT_NOT_FOUND',
  PAYMENT_VERIFICATION_FAILED: 'PAYMENT_VERIFICATION_FAILED',
  PAYMENT_SIGNATURE_INVALID: 'PAYMENT_SIGNATURE_INVALID',
  PAYMENT_GATEWAY_ERROR: 'PAYMENT_GATEWAY_ERROR',
  PAYMENT_NOT_CONFIGURED: 'PAYMENT_NOT_CONFIGURED',

  // coupons
  COUPON_NOT_FOUND: 'COUPON_NOT_FOUND',
  COUPON_INACTIVE: 'COUPON_INACTIVE',
  COUPON_EXPIRED: 'COUPON_EXPIRED',
  COUPON_NOT_STARTED: 'COUPON_NOT_STARTED',
  COUPON_USAGE_LIMIT_REACHED: 'COUPON_USAGE_LIMIT_REACHED',
  COUPON_USER_LIMIT_REACHED: 'COUPON_USER_LIMIT_REACHED',
  COUPON_MIN_ORDER_NOT_MET: 'COUPON_MIN_ORDER_NOT_MET',
  COUPON_CODE_EXISTS: 'COUPON_CODE_EXISTS',

  // reviews
  REVIEW_NOT_FOUND: 'REVIEW_NOT_FOUND',
  REVIEW_ALREADY_EXISTS: 'REVIEW_ALREADY_EXISTS',
  PURCHASE_REQUIRED: 'PURCHASE_REQUIRED',

  // uploads
  UPLOAD_FAILED: 'UPLOAD_FAILED',
  INVALID_FILE_TYPE: 'INVALID_FILE_TYPE',
  FILE_TOO_LARGE: 'FILE_TOO_LARGE',

  // users
  USER_NOT_FOUND: 'USER_NOT_FOUND',
  CANNOT_MODIFY_SELF: 'CANNOT_MODIFY_SELF',
} as const;

export type ErrorCodeValue = (typeof ErrorCode)[keyof typeof ErrorCode];

export interface FieldError {
  path: string;
  message: string;
}

/**
 * The only error type services and controllers should throw deliberately.
 * `isOperational` separates "expected, safe to surface" from genuine bugs.
 */
export class ApiError extends Error {
  public readonly statusCode: number;
  public readonly code: ErrorCodeValue;
  public readonly errors?: FieldError[];
  public readonly isOperational: boolean;
  public readonly details?: Record<string, unknown>;

  constructor(
    statusCode: number,
    message: string,
    code: ErrorCodeValue = ErrorCode.INTERNAL_ERROR,
    options: { errors?: FieldError[]; details?: Record<string, unknown>; isOperational?: boolean } = {},
  ) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.code = code;
    this.errors = options.errors;
    this.details = options.details;
    this.isOperational = options.isOperational ?? true;
    Error.captureStackTrace(this, this.constructor);
  }

  static badRequest(message: string, code: ErrorCodeValue = ErrorCode.BAD_REQUEST, errors?: FieldError[]): ApiError {
    return new ApiError(400, message, code, { errors });
  }

  static unauthorized(message = 'Authentication required', code: ErrorCodeValue = ErrorCode.UNAUTHORIZED): ApiError {
    return new ApiError(401, message, code);
  }

  static forbidden(message = 'You do not have permission to perform this action', code: ErrorCodeValue = ErrorCode.FORBIDDEN): ApiError {
    return new ApiError(403, message, code);
  }

  static notFound(message = 'Resource not found', code: ErrorCodeValue = ErrorCode.NOT_FOUND): ApiError {
    return new ApiError(404, message, code);
  }

  static conflict(message: string, code: ErrorCodeValue = ErrorCode.CONFLICT, details?: Record<string, unknown>): ApiError {
    return new ApiError(409, message, code, { details });
  }

  static unprocessable(message: string, code: ErrorCodeValue = ErrorCode.VALIDATION_ERROR, errors?: FieldError[]): ApiError {
    return new ApiError(422, message, code, { errors });
  }

  static tooManyRequests(message = 'Too many requests, please try again later'): ApiError {
    return new ApiError(429, message, ErrorCode.RATE_LIMITED);
  }

  static internal(message = 'Something went wrong', details?: Record<string, unknown>): ApiError {
    return new ApiError(500, message, ErrorCode.INTERNAL_ERROR, { details, isOperational: false });
  }

  static serviceUnavailable(message: string, code: ErrorCodeValue = ErrorCode.SERVICE_UNAVAILABLE): ApiError {
    return new ApiError(503, message, code);
  }
}
