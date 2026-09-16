/**
 * Commercial rules that a merchandiser might tune. Centralised so no service
 * invents its own shipping threshold or tax rate.
 */
export const PRICING = {
  /** Orders at or above this subtotal (after discount) ship free. */
  FREE_SHIPPING_THRESHOLD: 999,
  /** Flat shipping fee below the free-shipping threshold. */
  SHIPPING_FLAT_RATE: 79,
  /** GST applied to the discounted subtotal. */
  TAX_RATE: 0.18,
  CURRENCY: 'INR',
  /** Razorpay works in the smallest currency unit (paise). */
  CURRENCY_SUBUNIT_FACTOR: 100,
} as const;

export const CART = {
  MAX_QUANTITY_PER_ITEM: 10,
  MAX_DISTINCT_ITEMS: 50,
} as const;

export const ORDERS = {
  /** Days after delivery during which a return may be requested. */
  RETURN_WINDOW_DAYS: 7,
  NUMBER_PREFIX: 'SW',
} as const;

export const AUTH = {
  ACCESS_COOKIE: 'sw_access',
  REFRESH_COOKIE: 'sw_refresh',
  REFRESH_COOKIE_PATH: '/api/auth',
  EMAIL_VERIFICATION_TTL_HOURS: 24,
  PASSWORD_RESET_TTL_MINUTES: 60,
  BCRYPT_ROUNDS: 12,
  /** Carries the OAuth `state` and PKCE verifier between the two legs of the redirect. */
  OAUTH_COOKIE: 'sw_oauth',
  OAUTH_COOKIE_PATH: '/api/auth',
  /** How long a user has to finish the consent screen before the handshake is stale. */
  OAUTH_TTL_MINUTES: 10,
} as const;

export const PAGINATION = {
  DEFAULT_PAGE: 1,
  DEFAULT_LIMIT: 20,
  MAX_LIMIT: 100,
} as const;

export const CACHE_TTL = {
  PRODUCT_LIST: 60,
  PRODUCT_DETAIL: 120,
  CATEGORY_TREE: 300,
  BRAND_LIST: 300,
  DASHBOARD: 60,
} as const;

export const UPLOAD = {
  ALLOWED_MIME_TYPES: ['image/jpeg', 'image/png', 'image/webp', 'image/avif'] as const,
  ALLOWED_EXTENSIONS: ['.jpg', '.jpeg', '.png', '.webp', '.avif'] as const,
};

/** Whitelisted order status graph. Anything not listed here is a 409, not a 500. */
export const ORDER_STATUS_TRANSITIONS = {
  PENDING: ['CONFIRMED', 'CANCELLED'],
  CONFIRMED: ['PROCESSING', 'CANCELLED'],
  PROCESSING: ['SHIPPED', 'CANCELLED'],
  SHIPPED: ['OUT_FOR_DELIVERY', 'DELIVERED'],
  OUT_FOR_DELIVERY: ['DELIVERED'],
  DELIVERED: ['RETURN_REQUESTED'],
  RETURN_REQUESTED: ['RETURNED', 'DELIVERED'],
  RETURNED: ['REFUNDED'],
  CANCELLED: ['REFUNDED'],
  REFUNDED: [],
} as const satisfies Record<string, readonly string[]>;

/** Statuses a customer (not staff) is allowed to cancel from. */
export const CUSTOMER_CANCELLABLE_STATUSES = ['PENDING', 'CONFIRMED', 'PROCESSING'] as const;
