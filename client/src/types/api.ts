/** Mirrors the server's response envelope and domain shapes. */

export type Role = 'CUSTOMER' | 'STAFF' | 'ADMIN';

export type OrderStatus =
  | 'PENDING'
  | 'CONFIRMED'
  | 'PROCESSING'
  | 'SHIPPED'
  | 'OUT_FOR_DELIVERY'
  | 'DELIVERED'
  | 'CANCELLED'
  | 'RETURN_REQUESTED'
  | 'RETURNED'
  | 'REFUNDED';

export type PaymentStatus = 'PENDING' | 'AUTHORIZED' | 'PAID' | 'FAILED' | 'REFUNDED' | 'PARTIALLY_REFUNDED';
export type ProductStatus = 'DRAFT' | 'ACTIVE' | 'ARCHIVED';
export type CouponType = 'PERCENTAGE' | 'FIXED';

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
}

export interface ApiSuccess<T> {
  success: true;
  message?: string;
  data: T;
  meta?: PaginationMeta;
}

export interface ApiFieldError {
  path: string;
  message: string;
}

export interface ApiErrorBody {
  success: false;
  message: string;
  code: string;
  errors?: ApiFieldError[];
}

// ── Identity ────────────────────────────────────────────────────────────────

export interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  avatarUrl: string | null;
  role: Role;
  isActive: boolean;
  emailVerified: boolean;
  createdAt: string;
}

export interface Address {
  id: string;
  userId: string;
  fullName: string;
  phone: string;
  line1: string;
  line2: string | null;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  landmark: string | null;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

// ── Catalog ─────────────────────────────────────────────────────────────────

export interface CategorySummary {
  id: string;
  name: string;
  slug: string;
}

export interface Category extends CategorySummary {
  description: string | null;
  imageUrl: string | null;
  parentId: string | null;
  isActive: boolean;
  sortOrder: number;
  productCount: number;
  children?: Category[];
}

export interface Brand {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  logoUrl: string | null;
  website: string | null;
  isActive: boolean;
  productCount: number;
}

export interface ProductImage {
  id: string;
  url: string;
  alt: string | null;
  isPrimary: boolean;
  position: number;
}

export interface ProductVariant {
  id: string;
  name: string;
  sku: string;
  attributes: Record<string, string>;
  imageUrl: string | null;
  position: number;
  isActive: boolean;
  price: number;
  discountPrice: number | null;
  effectivePrice: number;
  discountPercentage: number;
  isDiscounted: boolean;
  /** Whether `price`/`discountPrice` are this variant's own or inherited from the product. */
  hasPriceOverride: boolean;
  hasDiscountOverride: boolean;
  inStock: boolean;
  stockQuantity: number;
  isLowStock: boolean;
}

export interface ProductAttribute {
  id: string;
  name: string;
  value: string;
  position: number;
}

/** Shape returned by product listings — deliberately lighter than the detail payload. */
export interface ProductListItem {
  id: string;
  name: string;
  slug: string;
  sku: string;
  shortDescription: string | null;
  status: ProductStatus;
  isFeatured: boolean;
  ratingAverage: number;
  reviewCount: number;
  soldCount: number;
  tags: string[];
  createdAt: string;
  category: CategorySummary | null;
  brand: { id: string; name: string; slug: string } | null;
  images: ProductImage[];
  price: number;
  discountPrice: number | null;
  effectivePrice: number;
  discountPercentage: number;
  isDiscounted: boolean;
  inStock: boolean;
  stockQuantity: number;
  isLowStock: boolean;
}

export interface Product extends Omit<ProductListItem, 'category'> {
  description: string;
  currency: string;
  category: (CategorySummary & { parentId: string | null }) | null;
  attributes: ProductAttribute[];
  variants: ProductVariant[];
  reservedQuantity: number;
  metaTitle: string | null;
  metaDescription: string | null;
  weightGrams: number | null;
}

// ── Cart ────────────────────────────────────────────────────────────────────

export interface CartIssue {
  itemId: string;
  code: 'PRODUCT_UNAVAILABLE' | 'VARIANT_UNAVAILABLE' | 'OUT_OF_STOCK' | 'QUANTITY_REDUCED' | 'PRICE_CHANGED';
  message: string;
}

export interface CartItem {
  id: string;
  productId: string;
  variantId: string | null;
  name: string;
  variantName: string | null;
  slug: string;
  sku: string;
  imageUrl: string | null;
  attributes: Record<string, string> | null;
  unitPrice: number;
  originalPrice: number;
  quantity: number;
  lineTotal: number;
  availableStock: number;
  maxQuantity: number;
  isAvailable: boolean;
}

export interface CartSummary {
  subtotal: number;
  discountAmount: number;
  shippingAmount: number;
  taxAmount: number;
  total: number;
  freeShippingThreshold: number;
  amountToFreeShipping: number;
  taxRatePercent: number;
  itemCount: number;
  totalQuantity: number;
}

export interface Cart {
  id: string;
  items: CartItem[];
  summary: CartSummary;
  issues: CartIssue[];
  /** Set when the cart was priced with a coupon; `summary` already includes it. */
  appliedCoupon: { code: string; discountAmount: number } | null;
  updatedAt: string;
}

// ── Wishlist ────────────────────────────────────────────────────────────────

export interface WishlistItem {
  id: string;
  productId: string;
  variantId: string | null;
  name: string;
  slug: string;
  sku: string;
  variantName: string | null;
  imageUrl: string | null;
  brand: { name: string; slug: string } | null;
  ratingAverage: number;
  reviewCount: number;
  price: number;
  discountPrice: number | null;
  effectivePrice: number;
  discountPercentage: number;
  isDiscounted: boolean;
  inStock: boolean;
  stockQuantity: number;
  isPurchasable: boolean;
  addedAt: string;
}

export interface Wishlist {
  id: string;
  items: WishlistItem[];
  itemCount: number;
}

// ── Orders ──────────────────────────────────────────────────────────────────

export interface OrderItem {
  id: string;
  productId: string | null;
  variantId: string | null;
  name: string;
  slug: string;
  sku: string;
  imageUrl: string | null;
  variantName: string | null;
  attributes: Record<string, string>;
  unitPrice: number;
  originalPrice: number;
  quantity: number;
  lineTotal: number;
}

export interface OrderEvent {
  id: string;
  status: OrderStatus;
  note: string | null;
  createdAt: string;
}

export interface Payment {
  id: string;
  provider: string;
  status: PaymentStatus;
  razorpayOrderId: string | null;
  razorpayPaymentId: string | null;
  amount: number;
  method: string | null;
  createdAt: string;
}

export interface Order {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  paymentMethod: 'RAZORPAY' | 'COD';
  subtotal: number;
  discountAmount: number;
  shippingAmount: number;
  taxAmount: number;
  total: number;
  currency: string;
  couponCode: string | null;
  shippingName: string;
  shippingPhone: string;
  shippingLine1: string;
  shippingLine2: string | null;
  shippingCity: string;
  shippingState: string;
  shippingPostalCode: string;
  shippingCountry: string;
  customerNote: string | null;
  placedAt: string;
  confirmedAt: string | null;
  shippedAt: string | null;
  deliveredAt: string | null;
  cancelledAt: string | null;
  cancellationReason: string | null;
  returnReason: string | null;
  createdAt: string;
  items: OrderItem[];
  events: OrderEvent[];
  payments: Payment[];
  itemCount: number;
  totalQuantity: number;
  user?: { id: string; email: string; firstName: string; lastName: string } | null;
}

export type OrderListItem = Pick<
  Order,
  'id' | 'orderNumber' | 'status' | 'paymentStatus' | 'total' | 'createdAt' | 'itemCount'
> & {
  items: Array<Pick<OrderItem, 'id' | 'name' | 'imageUrl' | 'quantity' | 'unitPrice' | 'variantName'>>;
  user?: { id: string; email: string; firstName: string; lastName: string } | null;
};

// ── Reviews ─────────────────────────────────────────────────────────────────

export interface Review {
  id: string;
  productId: string;
  rating: number;
  title: string | null;
  comment: string;
  isVerifiedPurchase: boolean;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  helpfulCount: number;
  images: Array<{ id: string; url: string }>;
  author: { id: string; name: string; avatarUrl: string | null };
  createdAt: string;
  updatedAt: string;
}

/** A review as the moderation queue sees it: the product it belongs to travels with it. */
export interface AdminReview extends Review {
  product: { id: string; name: string; slug: string };
}

export interface ReviewSummary {
  ratingAverage: number;
  reviewCount: number;
  distribution: Record<string, number>;
}

export interface ReviewEligibility {
  canReview: boolean;
  hasReviewed: boolean;
  hasPurchased: boolean;
  reviewId: string | null;
}

// ── Coupons ─────────────────────────────────────────────────────────────────

export interface Coupon {
  id: string;
  code: string;
  description: string | null;
  type: CouponType;
  value: number;
  minOrderAmount: number | null;
  maxDiscountAmount: number | null;
  usageLimit: number | null;
  perUserLimit: number | null;
  usedCount: number;
  startsAt: string;
  expiresAt: string | null;
  isActive: boolean;
  createdAt: string;
}

export interface AppliedCoupon {
  code: string;
  type: CouponType;
  value: number;
  description: string | null;
  discountAmount: number;
}

// ── Admin ───────────────────────────────────────────────────────────────────

export interface DashboardSummary {
  revenue: { total: number; today: number; month: number; averageOrderValue: number };
  orders: { total: number; pending: number; today: number; byStatus: Record<string, number> };
  customers: { total: number; newThisMonth: number };
  products: { total: number; lowStock: number; outOfStock: number };
}

export interface RevenuePoint {
  date: string;
  revenue: number;
  orders: number;
}

export interface BestSeller {
  productId: string | null;
  name: string;
  sku: string;
  unitsSold: number;
  revenue: number;
}

export interface LowStockRow {
  id: string;
  name: string;
  sku: string;
  slug: string;
  quantity: number;
  lowStockThreshold: number;
}

export interface Dashboard {
  summary: DashboardSummary;
  revenueSeries: RevenuePoint[];
  bestSellers: BestSeller[];
  recentOrders: Array<{
    id: string;
    orderNumber: string;
    status: OrderStatus;
    paymentStatus: PaymentStatus;
    total: number;
    createdAt: string;
    shippingName: string;
    itemCount: number;
    user: { id: string; email: string; firstName: string; lastName: string } | null;
  }>;
  lowStock: LowStockRow[];
  categories: Array<{ category: string; revenue: number; units: number }>;
}

export interface AdminUser extends User {
  lastLoginAt: string | null;
  orderCount: number;
  reviewCount: number;
}

export interface AdminUserDetail extends AdminUser {
  addresses: Address[];
  lifetimeValue: number;
  paidOrderCount: number;
  recentOrders: Array<{
    id: string;
    orderNumber: string;
    status: OrderStatus;
    paymentStatus: PaymentStatus;
    total: number;
    createdAt: string;
  }>;
}

// ── Query params ────────────────────────────────────────────────────────────

export interface ProductFilters {
  q?: string;
  category?: string;
  brands?: string[];
  minPrice?: number;
  maxPrice?: number;
  minRating?: number;
  inStock?: boolean;
  featured?: boolean;
  sort?: 'newest' | 'oldest' | 'price_asc' | 'price_desc' | 'rating' | 'popular' | 'name_asc' | 'name_desc';
  page?: number;
  limit?: number;
}
