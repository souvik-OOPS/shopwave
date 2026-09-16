import { http, requestWithMeta } from '@/lib/apiClient';
import type {
  Address,
  AdminUser,
  AdminUserDetail,
  AppliedCoupon,
  Brand,
  Cart,
  Category,
  Coupon,
  Dashboard,
  Order,
  OrderListItem,
  OrderStatus,
  PaginationMeta,
  Product,
  ProductFilters,
  ProductListItem,
  AdminReview,
  Review,
  ReviewEligibility,
  ReviewSummary,
  User,
  Wishlist,
} from '@/types/api';

/**
 * One module per domain, each a thin typed wrapper over an endpoint. Components call
 * these through React Query hooks and never build URLs themselves.
 */

/** Drops empty values so the URL carries only filters the user actually set. */
function toParams(filters: Record<string, unknown>): Record<string, string> {
  const params: Record<string, string> = {};

  for (const [key, value] of Object.entries(filters)) {
    if (value === undefined || value === null || value === '') continue;
    if (Array.isArray(value)) {
      if (value.length > 0) params[key] = value.join(',');
      continue;
    }
    params[key] = String(value);
  }

  return params;
}

export const authApi = {
  register: (payload: {
    firstName: string;
    lastName: string;
    email: string;
    password: string;
    phone?: string;
  }) => http.post<{ user: User }>('/auth/register', payload),

  login: (payload: { email: string; password: string }) =>
    http.post<{ user: User }>('/auth/login', payload),

  logout: () => http.post<null>('/auth/logout'),

  me: () => http.get<{ user: User }>('/auth/me'),

  updateProfile: (payload: { firstName?: string; lastName?: string; phone?: string | null }) =>
    http.patch<{ user: User }>('/auth/me', payload),

  changePassword: (payload: { currentPassword: string; newPassword: string }) =>
    http.post<null>('/auth/change-password', payload),

  forgotPassword: (email: string) => http.post<null>('/auth/forgot-password', { email }),

  resetPassword: (payload: { token: string; password: string }) =>
    http.post<null>('/auth/reset-password', payload),

  verifyEmail: (token: string) => http.post<{ user: User }>('/auth/verify-email', { token }),

  resendVerification: (email: string) => http.post<null>('/auth/resend-verification', { email }),
};

export const productApi = {
  async list(filters: ProductFilters): Promise<{ products: ProductListItem[]; meta?: PaginationMeta }> {
    const { data, meta } = await requestWithMeta<{ products: ProductListItem[] }>({
      method: 'GET',
      url: '/products',
      params: toParams(filters as Record<string, unknown>),
    });
    return { products: data.products, meta };
  },

  detail: (slug: string) => http.get<{ product: Product }>(`/products/${slug}`),

  related: (slug: string) => http.get<{ products: ProductListItem[] }>(`/products/${slug}/related`),

  facets: (filters: ProductFilters) =>
    http.get<{ priceRange: { min: number; max: number } }>('/products/facets', {
      params: toParams(filters as Record<string, unknown>),
    }),

  async adminList(filters: Record<string, unknown>) {
    const { data, meta } = await requestWithMeta<{ products: ProductListItem[] }>({
      method: 'GET',
      url: '/products/admin/all',
      params: toParams(filters),
    });
    return { products: data.products, meta };
  },

  adminDetail: (id: string) => http.get<{ product: Product }>(`/products/admin/${id}`),

  create: (payload: unknown) => http.post<{ product: Product }>('/products', payload),

  update: (id: string, payload: unknown) => http.patch<{ product: Product }>(`/products/${id}`, payload),

  remove: (id: string) => http.delete<null>(`/products/${id}`),

  updateInventory: (id: string, payload: { quantity?: number; delta?: number; variantId?: string }) =>
    http.patch<{ product: Product }>(`/products/${id}/inventory`, payload),

  uploadImages: (id: string, files: File[]) => {
    const form = new FormData();
    files.forEach((file) => form.append('images', file));
    // The browser must set the multipart boundary itself, so Content-Type is cleared.
    return http.post<{ product: Product }>(`/products/${id}/images`, form, {
      headers: { 'Content-Type': undefined },
    });
  },
};

export const categoryApi = {
  list: (params?: { tree?: boolean; includeInactive?: boolean }) =>
    http.get<{ categories: Category[] }>('/categories', { params: toParams(params ?? {}) }),

  detail: (slug: string) => http.get<{ category: Category }>(`/categories/${slug}`),

  create: (payload: unknown) => http.post<{ category: Category }>('/categories', payload),

  update: (id: string, payload: unknown) => http.patch<{ category: Category }>(`/categories/${id}`, payload),

  remove: (id: string) => http.delete<null>(`/categories/${id}`),
};

export const brandApi = {
  list: (params?: { includeInactive?: boolean }) =>
    http.get<{ brands: Brand[] }>('/brands', { params: toParams(params ?? {}) }),

  create: (payload: unknown) => http.post<{ brand: Brand }>('/brands', payload),

  update: (id: string, payload: unknown) => http.patch<{ brand: Brand }>(`/brands/${id}`, payload),

  remove: (id: string) => http.delete<null>(`/brands/${id}`),
};

export const cartApi = {
  /**
   * `couponCode` is passed to the server rather than applied here: a discount also moves
   * the free-shipping threshold and the GST base, and those rules live in one place.
   */
  get: (couponCode?: string | null) =>
    http.get<{ cart: Cart }>('/cart', couponCode ? { params: { couponCode } } : undefined),

  addItem: (payload: { productId: string; variantId?: string | null; quantity: number }) =>
    http.post<{ cart: Cart }>('/cart/items', payload),

  updateItem: (itemId: string, quantity: number) =>
    http.patch<{ cart: Cart }>(`/cart/items/${itemId}`, { quantity }),

  removeItem: (itemId: string) => http.delete<{ cart: Cart }>(`/cart/items/${itemId}`),

  clear: () => http.delete<{ cart: Cart }>('/cart'),

  reconcile: () => http.post<{ cart: Cart }>('/cart/reconcile'),
};

export const wishlistApi = {
  get: () => http.get<{ wishlist: Wishlist }>('/wishlist'),

  ids: () => http.get<{ productIds: string[] }>('/wishlist/ids'),

  add: (productId: string, variantId?: string | null) =>
    http.post<{ wishlist: Wishlist }>(`/wishlist/${productId}`, { variantId: variantId ?? null }),

  remove: (productId: string) => http.delete<{ wishlist: Wishlist }>(`/wishlist/${productId}`),

  moveToCart: (productId: string, payload: { variantId?: string | null; quantity?: number } = {}) =>
    http.post<{ cart: Cart; wishlist: Wishlist }>(`/wishlist/${productId}/move-to-cart`, payload),
};

export const addressApi = {
  list: () => http.get<{ addresses: Address[] }>('/addresses'),

  create: (payload: unknown) => http.post<{ address: Address }>('/addresses', payload),

  update: (id: string, payload: unknown) => http.patch<{ address: Address }>(`/addresses/${id}`, payload),

  remove: (id: string) => http.delete<null>(`/addresses/${id}`),

  setDefault: (id: string) => http.patch<{ address: Address }>(`/addresses/${id}/default`),
};

export const orderApi = {
  checkout: (payload: {
    addressId: string;
    couponCode?: string;
    paymentMethod?: 'RAZORPAY' | 'COD';
    customerNote?: string;
  }) => http.post<{ order: Order }>('/checkout', payload),

  async list(params: { page?: number; limit?: number; status?: OrderStatus }) {
    const { data, meta } = await requestWithMeta<{ orders: OrderListItem[] }>({
      method: 'GET',
      url: '/orders',
      params: toParams(params),
    });
    return { orders: data.orders, meta };
  },

  detail: (id: string) => http.get<{ order: Order }>(`/orders/${id}`),

  cancel: (id: string, reason?: string) =>
    http.patch<{ order: Order }>(`/orders/${id}/cancel`, { reason }),

  requestReturn: (id: string, reason: string) =>
    http.patch<{ order: Order }>(`/orders/${id}/return`, { reason }),
};

export const paymentApi = {
  config: () => http.get<{ keyId: string | null; currency: string; enabled: boolean }>('/payments/config'),

  createOrder: (orderId: string) =>
    http.post<{ razorpayOrderId: string; amount: number; currency: string; orderNumber: string }>(
      '/payments/create-order',
      { orderId },
    ),

  verify: (payload: {
    razorpay_order_id: string;
    razorpay_payment_id: string;
    razorpay_signature: string;
  }) => http.post<{ order: Order }>('/payments/verify', payload),
};

export const couponApi = {
  validate: (code: string) => http.post<{ coupon: AppliedCoupon; cart: Cart }>('/coupons/validate', { code }),

  async list(params: Record<string, unknown>) {
    const { data, meta } = await requestWithMeta<{ coupons: Coupon[] }>({
      method: 'GET',
      url: '/coupons',
      params: toParams(params),
    });
    return { coupons: data.coupons, meta };
  },

  create: (payload: unknown) => http.post<{ coupon: Coupon }>('/coupons', payload),

  update: (id: string, payload: unknown) => http.patch<{ coupon: Coupon }>(`/coupons/${id}`, payload),

  remove: (id: string) => http.delete<{ deleted: boolean }>(`/coupons/${id}`),
};

export const reviewApi = {
  async forProduct(slug: string, params: Record<string, unknown>) {
    const { data, meta } = await requestWithMeta<{ reviews: Review[]; summary: ReviewSummary }>({
      method: 'GET',
      url: `/reviews/product/${slug}`,
      params: toParams(params),
    });
    return { reviews: data.reviews, summary: data.summary, meta };
  },

  eligibility: (productId: string) => http.get<ReviewEligibility>(`/reviews/eligibility/${productId}`),

  create: (payload: { productId: string; rating: number; title?: string; comment: string }) =>
    http.post<{ review: Review }>('/reviews', payload),

  update: (id: string, payload: { rating?: number; title?: string; comment?: string }) =>
    http.patch<{ review: Review }>(`/reviews/${id}`, payload),

  remove: (id: string) => http.delete<null>(`/reviews/${id}`),
};

export const adminApi = {
  dashboard: () => http.get<Dashboard>('/admin/dashboard'),

  revenueSeries: (days: number) =>
    http.get<{ series: Array<{ date: string; revenue: number; orders: number }> }>(
      '/admin/analytics/revenue',
      { params: { days } },
    ),

  async orders(params: Record<string, unknown>) {
    const { data, meta } = await requestWithMeta<{ orders: OrderListItem[] }>({
      method: 'GET',
      url: '/admin/orders',
      params: toParams(params),
    });
    return { orders: data.orders, meta };
  },

  order: (id: string) => http.get<{ order: Order }>(`/admin/orders/${id}`),

  updateOrderStatus: (id: string, payload: { status: OrderStatus; note?: string }) =>
    http.patch<{ order: Order }>(`/admin/orders/${id}/status`, payload),

  refundOrder: (id: string, amount?: number) =>
    http.post<{ order: Order }>(`/admin/orders/${id}/refund`, amount ? { amount } : {}),

  async users(params: Record<string, unknown>) {
    const { data, meta } = await requestWithMeta<{ users: AdminUser[] }>({
      method: 'GET',
      url: '/admin/users',
      params: toParams(params),
    });
    return { users: data.users, meta };
  },

  user: (id: string) => http.get<{ user: AdminUserDetail }>(`/admin/users/${id}`),

  updateUser: (id: string, payload: { role?: string; isActive?: boolean }) =>
    http.patch<{ user: AdminUser }>(`/admin/users/${id}`, payload),

  async reviews(params: Record<string, unknown>) {
    const { data, meta } = await requestWithMeta<{ reviews: AdminReview[] }>({
      method: 'GET',
      url: '/admin/reviews',
      params: toParams(params),
    });
    return { reviews: data.reviews, meta };
  },

  moderateReview: (id: string, status: Review['status']) =>
    http.patch<{ review: Review }>(`/admin/reviews/${id}`, { status }),
};
