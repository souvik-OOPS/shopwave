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
  /**
   * How long an unpaid online order holds its stock after the last payment attempt.
   * Closing the Razorpay window sends no failure event, so without a deadline that
   * stock would stay reserved forever.
   */
  UNPAID_HOLD_MINUTES: 30,
  UNPAID_SWEEP_INTERVAL_MS: 5 * 60 * 1000,
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

/**
 * Proxies allowed to append to X-Forwarded-For. On Render a request crosses Cloudflare
 * (twice when the storefront's /api rewrite forwards it) and Render's private network
 * before it reaches the app, so no fixed hop count is right for both routes. Trusting
 * these ranges makes req.ip the right-most address none of them added — the visitor —
 * and anything a client writes into the header itself lands to the left of that.
 * Cloudflare publishes its ranges at https://www.cloudflare.com/ips/
 */
export const TRUSTED_PROXIES = [
  'loopback',
  'uniquelocal',
  '173.245.48.0/20',
  '103.21.244.0/22',
  '103.22.200.0/22',
  '103.31.4.0/22',
  '141.101.64.0/18',
  '108.162.192.0/18',
  '190.93.240.0/20',
  '188.114.96.0/20',
  '197.234.240.0/22',
  '198.41.128.0/17',
  '162.158.0.0/15',
  '104.16.0.0/13',
  '104.24.0.0/14',
  '172.64.0.0/13',
  '131.0.72.0/22',
  '2400:cb00::/32',
  '2606:4700::/32',
  '2803:f800::/32',
  '2405:b500::/32',
  '2405:8100::/32',
  '2a06:98c0::/29',
  '2c0f:f248::/32',
];

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
