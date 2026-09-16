# ShopWave — Architecture & Design

This document is the design contract that the implementation follows. It was written before the
code, per the development requirements: schema first, then API, then auth, then folder layout, then
business rules.

---

## 1. System overview

```
┌──────────────────────────┐         ┌───────────────────────────────────────┐
│  client/  (React SPA)    │  HTTPS  │  server/  (Express REST API)          │
│  Vite · TS · Tailwind    │ ──────► │  Layered: routes → controllers →      │
│  Redux Toolkit (client   │  cookie │  services → repositories → Prisma     │
│  state) + React Query    │  auth   │                                       │
│  (server state)          │ ◄────── │                                       │
└──────────────────────────┘         └───────────────┬───────────────────────┘
                                                     │
                        ┌────────────────────────────┼────────────────────────────┐
                        │                │           │            │               │
                   PostgreSQL         Redis      Cloudinary    Razorpay        Nodemailer
                   (source of      (cache +     (images)      (payments)      (SMTP) or
                    truth)          rate limit)                               Resend
```

**Layer responsibilities**

| Layer          | Responsibility                                                                 | May not do                          |
| -------------- | ------------------------------------------------------------------------------ | ----------------------------------- |
| `routes`       | URL → middleware chain → controller binding                                     | Business logic, DB access           |
| `middleware`   | Auth, RBAC, validation, rate limiting, uploads, error translation               | Business logic                      |
| `controllers`  | Read validated input off `req`, call a service, shape the HTTP response         | Business rules, Prisma access       |
| `services`     | Business rules, orchestration, transactions, invariants                         | Touch `req`/`res`, know about HTTP  |
| `repositories` | Prisma queries, selection shapes, pagination primitives                         | Business rules                      |
| `lib`          | Third-party client singletons (Prisma, Redis, Cloudinary, Razorpay, mailer)     | Business rules                      |
| `schemas`      | Zod request/response contracts, inferred TS types                               | —                                   |

Controllers never `import { prisma }`. Services never import `express`.

---

## 2. Database design

### 2.1 Enums

| Enum             | Values                                                                                                                     |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `Role`           | `CUSTOMER`, `STAFF`, `ADMIN`                                                                                                 |
| `ProductStatus`  | `DRAFT`, `ACTIVE`, `ARCHIVED`                                                                                                |
| `OrderStatus`    | `PENDING`, `CONFIRMED`, `PROCESSING`, `SHIPPED`, `OUT_FOR_DELIVERY`, `DELIVERED`, `CANCELLED`, `RETURN_REQUESTED`, `RETURNED`, `REFUNDED` |
| `PaymentStatus`  | `PENDING`, `AUTHORIZED`, `PAID`, `FAILED`, `REFUNDED`, `PARTIALLY_REFUNDED`                                                  |
| `PaymentMethod`  | `RAZORPAY`, `COD`                                                                                                            |
| `CouponType`     | `PERCENTAGE`, `FIXED`                                                                                                        |
| `ReviewStatus`   | `PENDING`, `APPROVED`, `REJECTED`                                                                                            |
| `TokenType`      | `EMAIL_VERIFICATION`, `PASSWORD_RESET`                                                                                       |
| `AuthProvider`   | `GOOGLE`                                                                                                                     |

### 2.2 Entity relationships

```
User 1─n Address            User 1─1 Cart 1─n CartItem ─n─1 Product
User 1─1 Wishlist 1─n WishlistItem                     ─n─1 ProductVariant
User 1─n Order 1─n OrderItem  (immutable product snapshot)
User 1─n Review 1─n ReviewImage
User 1─n RefreshToken (rotating family)
User 1─n VerificationToken (email verify / password reset, hashed)
User 1─n OAuthAccount (one row per linked provider; unique on provider+subject)
User 1─n CouponUsage ─n─1 Coupon

Category 1─n Product        Category 1─n Category (self, parentId)
Brand    1─n Product
Product  1─n ProductImage
Product  1─n ProductVariant
Product  1─n ProductAttribute
Product  1─1 Inventory      ProductVariant 1─1 Inventory
Order    1─n Payment        Order 1─n OrderEvent   Order 1─1 CouponUsage
```

**Money** is stored as `Decimal(12, 2)` — never floats. It crosses the API as a string-safe number
produced by a single serializer so JS float error never enters a total.

**Stock** lives only in `Inventory`, which is the single writable row for a sellable unit
(a product without variants, or one variant). It carries `quantity` (available to sell) and
`reserved` (held by unpaid orders). `Product.stock` does not exist as a mutable duplicate.

**Key indexes**

- `Product`: `slug` unique, `sku` unique, `(status, createdAt)`, `(categoryId, status)`,
  `(brandId, status)`, `price`, `ratingAverage`, plus a GIN trigram index on `name`/`description`
  for search (raw SQL migration).
- `Order`: `orderNumber` unique, `(userId, createdAt)`, `(status, createdAt)`.
- `RefreshToken`: `tokenHash` unique, `(userId, familyId)`.
- `Review`: `(productId, userId)` unique — one review per customer per product.
- `CouponUsage`: `orderId` unique, `(couponId, userId)` index for per-user limit checks.

**Cascades**: deleting a `User` cascades to their cart, wishlist, addresses, tokens and reviews, but
**orders are retained** (`onDelete: SetNull` on `Order.userId`) because orders are financial records.
Deleting a `Product` is a soft delete (`deletedAt`); `OrderItem` keeps its own snapshot regardless.

---

## 3. API design

All responses share one envelope:

```jsonc
// success
{ "success": true, "data": { ... }, "meta": { "page": 1, "limit": 20, "total": 137, "totalPages": 7 } }
// error
{ "success": false, "message": "Product not found", "code": "PRODUCT_NOT_FOUND", "errors": [ ... ] }
```

`code` is a stable machine-readable string; `message` is human text. `errors` appears only for
validation failures and lists `{ path, message }`.

| Method | Path                             | Auth      | Purpose                                  |
| ------ | -------------------------------- | --------- | ---------------------------------------- |
| POST   | `/api/auth/register`             | –         | Create account, send verification email  |
| POST   | `/api/auth/login`                | –         | Set access + refresh cookies             |
| POST   | `/api/auth/logout`               | user      | Revoke refresh token, clear cookies      |
| POST   | `/api/auth/refresh`              | cookie    | Rotate refresh token                     |
| GET    | `/api/auth/me`                   | user      | Current profile                          |
| PATCH  | `/api/auth/me`                   | user      | Update profile                           |
| POST   | `/api/auth/change-password`      | user      | Change password, revoke other sessions   |
| POST   | `/api/auth/forgot-password`      | –         | Email a reset link (always 200)          |
| POST   | `/api/auth/reset-password`       | –         | Consume reset token                      |
| POST   | `/api/auth/verify-email`         | –         | Consume verification token               |
| POST   | `/api/auth/resend-verification`  | –         | Re-issue verification email              |
| GET    | `/api/auth/google`               | –         | Redirect to Google's consent screen       |
| GET    | `/api/auth/google/callback`      | state     | Exchange code, set cookies, redirect home |
| GET    | `/api/products`                  | –         | List: search/filter/sort/paginate        |
| GET    | `/api/products/:slug`            | –         | Detail by slug                           |
| GET    | `/api/products/:slug/related`    | –         | Same-category products                   |
| POST   | `/api/products`                  | ADMIN/STAFF | Create                                 |
| PATCH  | `/api/products/:id`              | ADMIN/STAFF | Update                                 |
| DELETE | `/api/products/:id`              | ADMIN     | Soft delete                              |
| POST   | `/api/products/:id/images`       | ADMIN/STAFF | Multipart upload to Cloudinary         |
| PATCH  | `/api/products/:id/inventory`    | ADMIN/STAFF | Adjust stock                           |
| GET/POST/PATCH/DELETE | `/api/categories[/:id]` | mixed | Category CRUD (`GET` public)         |
| GET/POST/PATCH/DELETE | `/api/brands[/:id]`     | mixed | Brand CRUD (`GET` public)            |
| GET    | `/api/cart`                      | user      | Server-computed cart                     |
| POST   | `/api/cart/items`                | user      | Add item (stock-checked)                 |
| PATCH  | `/api/cart/items/:id`            | user      | Set quantity                             |
| DELETE | `/api/cart/items/:id`            | user      | Remove item                              |
| DELETE | `/api/cart`                      | user      | Clear                                    |
| POST   | `/api/cart/coupon`               | user      | Preview a coupon against the live cart   |
| GET/POST/DELETE | `/api/wishlist[/:productId]` | user | Wishlist ops                         |
| POST   | `/api/wishlist/:productId/move-to-cart` | user | Move to cart                    |
| GET/POST/PATCH/DELETE | `/api/addresses[/:id]` | user | Address book                        |
| PATCH  | `/api/addresses/:id/default`     | user      | Set default                              |
| POST   | `/api/checkout`                  | user      | Quote + create PENDING order             |
| POST   | `/api/payments/create-order`     | user      | Create Razorpay order for an order id    |
| POST   | `/api/payments/verify`           | user      | HMAC-verify handshake                    |
| POST   | `/api/payments/webhook`          | signature | Authoritative payment state (raw body)   |
| GET    | `/api/orders`                    | user      | Own orders                               |
| GET    | `/api/orders/:id`                | user      | Own order detail + timeline              |
| PATCH  | `/api/orders/:id/cancel`         | user      | Cancel if eligible, restock              |
| PATCH  | `/api/orders/:id/return`         | user      | Request return within window             |
| GET/POST/PATCH/DELETE | `/api/reviews` | mixed | Reviews (verified purchase enforced)      |
| GET    | `/api/coupons/*`, admin CRUD     | ADMIN     | Coupon management                        |
| GET    | `/api/admin/dashboard`           | ADMIN/STAFF | KPIs, charts, recent orders            |
| GET    | `/api/admin/orders`              | ADMIN/STAFF | All orders + filters                   |
| PATCH  | `/api/admin/orders/:id/status`   | ADMIN/STAFF | Status transition                      |
| GET    | `/api/admin/users`               | ADMIN     | Customer directory                       |
| PATCH  | `/api/admin/users/:id`           | ADMIN     | Enable/disable, change role              |

---

## 4. Authentication flow

**Tokens**

- *Access token* — JWT (HS256), 15 min TTL, claims `{ sub, role, tokenVersion }`, delivered in the
  `sw_access` HTTP-only cookie (`SameSite=Lax`, `Secure` in production).
- *Refresh token* — 64 random bytes, base64url. Only its **SHA-256 hash** is stored. Delivered in the
  `sw_refresh` HTTP-only cookie scoped to `/api/auth`, 30 day TTL.

**Rotation with reuse detection**

Each refresh token carries a `familyId`. On `/api/auth/refresh` the presented token is looked up by
hash:

1. Not found or expired → 401, clear cookies.
2. Found but `revokedAt != null` → **reuse detected**: revoke the entire family (the token was
   replayed, likely stolen) and return 401.
3. Otherwise → mark it revoked, issue a new refresh token in the same family with `replacedById`
   linked, and mint a fresh access token.

**Login flow**: verify password with bcrypt → reject if `isActive === false` → issue token pair.
**Logout**: revoke the presented refresh token, clear both cookies.
**Change password / reset password**: bump `User.tokenVersion` (invalidates every outstanding access
token) and revoke every refresh token for the user.

**Email verification & password reset** use the same `VerificationToken` table: a random 32-byte
token, stored hashed, single-use, with a type discriminator and expiry (24 h verify / 1 h reset).
`forgot-password` always answers `200` regardless of whether the email exists, to avoid user
enumeration.

**Authorization**: `requireAuth` populates `req.user`; `requireRole(...roles)` gates by role.
`ADMIN ⊃ STAFF ⊃ CUSTOMER` is *not* implicit — routes list the roles they accept explicitly.

### 4.1 Google sign-in

A **server-side** OpenID Connect authorization-code flow with PKCE. The browser never handles a
Google token; the flow ends with the same `sw_access` / `sw_refresh` cookie pair a password login
produces, so there is exactly one session mechanism in the app.

```
GET /api/auth/google          → mint state + PKCE verifier, park both in the `sw_oauth`
                                cookie (10 min, HttpOnly), 302 to accounts.google.com
GET /api/auth/google/callback → compare state with the cookie (constant-time), POST the code
                                + verifier to Google's token endpoint, validate the ID token's
                                iss / aud / exp, issue cookies, 302 back to the client
```

**Account resolution**, in order:

1. `(GOOGLE, sub)` already in `OAuthAccount` → that user signs in. The provider's subject id is the
   join key, never the email, which the user can change.
2. Otherwise, an existing `User` with that email → **link** and mark the address verified, so a
   password user who later clicks the Google button lands in their own account.
3. Otherwise → provision a `User` with `passwordHash = null`, `emailVerified = true`, plus its cart,
   wishlist and `OAuthAccount` row in one transaction.

Step 2 is only safe because a callback whose ID token lacks `email_verified` is rejected outright —
without that, an IdP permitting arbitrary email claims would be an account-takeover path.

**Password columns are nullable.** A Google-only account has no `passwordHash`, so `POST /auth/login`
answers the *generic* `INVALID_CREDENTIALS` (after an equalising bcrypt compare) rather than "this
one uses Google" — the latter would confirm that an address is registered. Such a user adds a
password through the ordinary `forgot-password` → `reset-password` flow, which writes `passwordHash`
whether or not one was there before.

**Redirect safety.** `?redirect=` is reduced to a single in-app path; anything absolute or
protocol-relative (`//host`, `/\host`) collapses to `/`. An OAuth callback is the classic open-redirect
target because the victim arrives freshly authenticated. Failures never render a body — they bounce to
`/login?error=CODE` carrying the same stable `ErrorCode` vocabulary the JSON endpoints use.

The `sw_oauth` cookie is the one cookie that ignores `COOKIE_SAME_SITE`: Google's redirect back is a
cross-site top-level navigation, and `SameSite=Strict` would drop it and break every sign-in.

Both endpoints answer `503 OAUTH_NOT_CONFIGURED` when `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` are
unset, so the rest of the app runs unchanged without Google credentials.

---

## 5. Business rules (the invariants worth stating)

1. **The client never sets money.** Prices, discounts, shipping, tax and totals are recomputed from
   the database on every cart read and at checkout. Request bodies carrying `price` or `total` are
   stripped by Zod (`.strict()` where mass assignment is a risk).
2. **Stock is checked twice** — advisory at add-to-cart (fast feedback), authoritative inside the
   checkout transaction using a conditional atomic decrement:
   `UPDATE ... SET quantity = quantity - n WHERE id = ? AND quantity >= n`. Zero rows updated means
   another buyer won the race → the whole transaction aborts with `INSUFFICIENT_STOCK`.
3. **Reservation model.** Creating an order moves `n` units from `quantity` → `reserved`. Payment
   success clears the reservation. Cancellation, failure or webhook-reported failure returns the
   units to `quantity`. Stock therefore cannot be oversold by an abandoned checkout.
4. **Order items are immutable snapshots** of name, slug, SKU, image, unit price, discount price,
   quantity, line total and variant attributes. Editing a product later never rewrites history.
5. **Payment status comes only from Razorpay.** `/payments/verify` validates
   `HMAC_SHA256(razorpay_order_id + "|" + razorpay_payment_id, key_secret)` against the supplied
   signature; the webhook validates `X-Razorpay-Signature` over the **raw request body**. A client
   claiming "paid" without a valid signature is rejected. The webhook is idempotent and is the
   authority — verify is a UX fast-path that reaches the same state.
6. **Coupons validate entirely server-side**: active, within `startsAt`/`expiresAt`, global
   `usageLimit`, `perUserLimit` counted from `CouponUsage`, `minOrderAmount` against the live
   subtotal, discount capped by `maxDiscountAmount` and by the subtotal itself.
7. **Verified reviews only from buyers.** A review is accepted only if the user has a `DELIVERED`
   order containing that product; `isVerifiedPurchase` is derived server-side, never sent by the
   client. One review per user per product.
8. **Order status transitions** follow a whitelist graph; illegal transitions are 409, not 500.
   Customers may cancel only in `PENDING`/`CONFIRMED`/`PROCESSING`, and may request a return only
   within 7 days of `DELIVERED`.
9. **Free shipping** above ₹999, otherwise ₹79. Tax is 18% GST computed on the discounted subtotal.
   These live in one `config/pricing.ts` constant block, not scattered through services.

---

## 6. Folder structure

```
server/src/
├── config/        env parsing (zod), constants, pricing rules
├── controllers/   HTTP in/out only
├── services/      business rules, transactions
├── repositories/  Prisma access, select shapes
├── routes/        route tables per resource + index
├── middleware/    auth, rbac, validate, rate limit, upload, error handler
├── schemas/       zod contracts + inferred types
├── utils/         ApiError, response helpers, jwt, password, slug, pagination, money
├── types/         express augmentation, shared domain types
├── lib/           prisma, redis, cloudinary, razorpay, google, mailer, logger
├── app.ts         express wiring (no listen)
└── server.ts      bootstrap, graceful shutdown
```

Client mirrors this with `features/` (Redux slices + API modules per domain), `pages/`,
`components/ui/` (design-system primitives) and `components/` (composed widgets).

---

## 7. Theming

Light / dark / system, chosen in the header and persisted in `localStorage`; `system`
tracks the OS preference live. State lives in `features/theme/themeSlice.ts` (`mode` is what
the user asked for, `resolved` is what is painted); `hooks/useTheme.ts` is the only writer of
the `dark` class on `<html>`.

**Token rule.** Every themed colour is a CSS variable holding an `R G B` triplet, declared for
`:root` and `.dark` in `styles/index.css`. The neutral ramp is inverted *by role*, not
mirrored: `text-ink-900` means "primary text" in either theme. Components therefore carry one
set of classes rather than a `dark:` twin per colour, and `canvas` / `surface` /
`surface-raised` name the page, card and popover backgrounds.

Two things deliberately opt out of theming, and both use Tailwind's literal ramps
(`slate`, `indigo`, `red`) so they cannot invert:

1. Surfaces that are dark in both themes — hero, auth panel, modal scrims.
2. Solid fills carrying white text — a themed `-700` lightens in dark mode and would leave
   white text at 2:1 contrast.

An inline script in `index.html` applies the stored theme before first paint. It duplicates
the storage key from `lib/theme.ts` by necessity — a module import would run too late to
prevent a flash.
