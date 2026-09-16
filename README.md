# ShopWave

A production-oriented full-stack e-commerce platform: React + TypeScript storefront and
admin dashboard, Express + Prisma REST API, PostgreSQL, Razorpay payments.

The guiding principle throughout is that **the server owns everything that matters**.
Prices, stock, discounts, order state and payment status are computed and verified
server-side; the client sends product ids and quantities, and nothing else that could
change what a customer is charged.

---

## Contents

- [Overview](#overview)
- [Tech stack](#tech-stack)
- [Architecture](#architecture)
- [Getting started](#getting-started)
- [Environment variables](#environment-variables)
- [Database & migrations](#database--migrations)
- [Development commands](#development-commands)
- [API reference](#api-reference)
- [Security](#security)
- [Testing](#testing)
- [Production build & deployment](#production-build--deployment)
- [Project structure](#project-structure)

---

## Overview

**Customer**
Register / sign in with rotating refresh tokens · email verification · password reset ·
catalogue with multi-field search, faceted filtering, sorting and pagination · product
variants · server-validated cart · wishlist · address book · coupon codes · Razorpay
checkout · order tracking, cancellation and returns · verified-purchase reviews ·
light / dark / system theme.

**Admin / staff**
Revenue and order dashboards with charts · product CRUD with variants, images and
inventory · category and brand management · order management with a whitelisted status
workflow · refunds · coupon management · customer directory with role and activation
control · review moderation.

**Roles** — `CUSTOMER`, `STAFF`, `ADMIN`. Routes list the roles they accept explicitly;
`ADMIN` does not silently inherit `STAFF` permissions.

---

## Tech stack

| Layer     | Choices                                                                          |
| --------- | -------------------------------------------------------------------------------- |
| Frontend  | React 18, TypeScript, Vite, Tailwind CSS, React Router 6, Redux Toolkit, TanStack Query, React Hook Form + Zod, Axios, Recharts, Lucide |
| Backend   | Node 20+, TypeScript (strict), Express 4, Prisma 5, PostgreSQL 16, Zod, JWT, bcrypt, Pino |
| Services  | Cloudinary (images), Razorpay (payments), Redis (cache + rate limiting, optional), Nodemailer / Resend (email) |
| Tooling   | Vitest, Supertest, ESLint (type-aware), Prettier, Docker Compose                  |

**Why bcrypt over argon2** — bcrypt at cost 12 needs no native build step, so
`npm install` behaves identically on Windows, Alpine and CI without a toolchain.

**Why Redis is optional** — it is an optimisation, never a dependency. If it is absent
or falls over, every cache helper degrades to a miss and requests still serve from
PostgreSQL. See [`server/src/lib/redis.ts`](server/src/lib/redis.ts).

---

## Architecture

```
┌──────────────────────────┐         ┌───────────────────────────────────────┐
│  client/  (React SPA)    │  HTTPS  │  server/  (Express REST API)          │
│  Redux → client state    │ ──────► │  routes → controllers → services      │
│  React Query → server    │  cookie │        → repositories → Prisma        │
│  state                   │ ◄────── │                                       │
└──────────────────────────┘         └───────────────┬───────────────────────┘
                                                     │
                   PostgreSQL · Redis · Cloudinary · Razorpay · SMTP/Resend
```

**Layer rules** (enforced by review, visible in the imports):

| Layer          | Does                                                     | Never does                    |
| -------------- | -------------------------------------------------------- | ----------------------------- |
| `routes`       | URL → middleware chain → controller                      | Business logic, DB access     |
| `middleware`   | Auth, RBAC, validation, rate limits, uploads, errors      | Business logic                |
| `controllers`  | Read validated input, call a service, shape the response | Business rules, Prisma access |
| `services`     | Business rules, transactions, invariants                 | Touch `req`/`res`             |
| `repositories` | Prisma queries and selection shapes                      | Business rules                |

A controller never imports `prisma`. A service never imports `express`.

Full design rationale — schema, API surface, auth flow and business invariants — is in
**[ARCHITECTURE.md](ARCHITECTURE.md)**.

### State management split

Redux Toolkit holds **client** state: session identity, cart/wishlist counters for the
header badges, and UI chrome (toasts, drawers, dialogs). TanStack Query holds **server**
state: products, orders, the authoritative cart. There is no `productsSlice` full of
loading booleans — that is the query cache's job.

### Theming

Light, dark and system, toggled from the header (and the admin sidebar). The chosen mode
persists in `localStorage`; `system` follows the OS live via `matchMedia`, so changing the
OS appearance re-themes an open tab.

Every themed colour resolves through a CSS variable holding an `R G B` triplet, declared
once for `:root` and once for `.dark` in
[`client/src/styles/index.css`](client/src/styles/index.css) and wired into Tailwind in
[`client/tailwind.config.js`](client/tailwind.config.js). The neutral ramp is inverted **by
role** rather than mirrored: `text-ink-900` means "primary text" in both themes, so
components carry one set of classes instead of a `dark:` twin for every colour. Semantic
`canvas` / `surface` / `surface-raised` tokens cover page, card and popover backgrounds.

Two deliberate exceptions:

- Surfaces that are dark in *both* themes — the hero, the auth panel, modal scrims — use
  Tailwind's literal `slate`/`indigo` ramps so they don't invert.
- Solid fills carrying white text (`primary`, `danger` buttons) use literal `indigo`/`red`,
  because a themed `-700` lightens in dark mode and would strand white text at 2:1 contrast.

A small inline script in [`client/index.html`](client/index.html) applies the stored theme
before first paint, so a dark-mode visitor never sees a white flash. Recharts is handed an
explicit palette per render — it paints SVG attributes and cannot inherit CSS variables.

---

## Getting started

**Prerequisites** — Node.js 20+, PostgreSQL 16 (or Docker), npm 9+.

```bash
# 1 — infrastructure (or point DATABASE_URL at your own Postgres)
docker compose up -d

# 2 — API
cd server
cp .env.example .env          # then fill in the secrets, see below
npm install
npm run prisma:generate
npm run prisma:migrate        # creates the schema
npm run prisma:seed           # demo catalogue, coupons and users
npm run dev                   # http://localhost:5000

# 3 — storefront (in a second terminal)
cd client
npm install
npm run dev                   # http://localhost:5173
```

Generate the two JWT secrets with:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

### Seeded accounts

| Role     | Email                    | Password        |
| -------- | ------------------------ | --------------- |
| Admin    | `admin@shopwave.test`    | `Admin@1234`    |
| Staff    | `staff@shopwave.test`    | `Staff@1234`    |
| Customer | `customer@shopwave.test` | `Customer@1234` |

The app runs with **zero third-party configuration**. Without Cloudinary, image upload
endpoints return a clear 503; without Razorpay, checkout creates a `PENDING` order and
tells you payments are not configured; without Google credentials the sign-in button
reports that it is unavailable; with no mail credentials the console driver logs emails
instead of sending them.

### Sending real email

Mail goes out through [Nodemailer](https://nodemailer.com). `MAIL_DRIVER` is resolved
from what you configure — set `SMTP_SERVICE` or `SMTP_HOST` and SMTP is used
automatically; set only `RESEND_API_KEY` and Resend's HTTP API is used instead. Set
`MAIL_DRIVER` explicitly to override.

```bash
# Gmail (App Password, not your account password)
SMTP_SERVICE=gmail
SMTP_USER=you@gmail.com
SMTP_PASSWORD=abcd efgh ijkl mnop

# Or any relay — MailHog/Mailpit locally needs no credentials at all
SMTP_HOST=localhost
SMTP_PORT=1025
```

The transport is verified once at boot: a bad host or rejected login is logged as an
error at startup rather than discovered on a customer's first password reset. Sending
itself stays best-effort — a mail outage never rolls back a completed signup or order.

### Enabling Google sign-in

Optional. Leave the variables blank and the rest of the app is unaffected — the button
is still rendered, and pressing it lands on the login page with a clear error.

1. [Google Cloud console](https://console.cloud.google.com/apis/credentials) →
   **APIs & Services → Credentials → Create credentials → OAuth client ID**.
2. Application type **Web application**.
3. Under **Authorised redirect URIs**, add the value you will set as
   `GOOGLE_REDIRECT_URI` — character for character, or Google answers
   `redirect_uri_mismatch`:

   ```
   http://localhost:5173/api/auth/google/callback     # dev, through the Vite proxy
   https://api.yourdomain.com/api/auth/google/callback # production
   ```

4. On the **OAuth consent screen**, add the `openid`, `email` and `profile` scopes.
   Nothing else is requested — no Gmail, Drive or contacts access.
5. Copy the client id and secret into `server/.env`:

   ```bash
   GOOGLE_CLIENT_ID=1234567890-abcdefg.apps.googleusercontent.com
   GOOGLE_CLIENT_SECRET=GOCSPX-xxxxxxxxxxxxxxxxxxxx
   GOOGLE_REDIRECT_URI=http://localhost:5173/api/auth/google/callback
   ```

Both variables must be set together — starting with only one fails validation at boot
rather than at a user's first sign-in attempt.

The dev redirect deliberately points at the **client's** origin, not the API's: Vite
proxies `/api` through to port 5000, so the session cookies Google's redirect ends up
setting are first-party for the app.

Signing in with a Google address that already has a password account **links** the two —
one account, two ways in. A Google-only account has no password until its owner sets one
through *Forgot password*; until then, password login for it fails with the ordinary
"invalid email or password" (saying more would confirm the address is registered).

---

## Environment variables

Full annotated template: [`server/.env.example`](server/.env.example).

| Variable | Required | Notes |
| -------- | :------: | ----- |
| `DATABASE_URL` | ✅ | PostgreSQL connection string |
| `JWT_ACCESS_SECRET` | ✅ | ≥ 32 chars; must differ from the refresh secret |
| `JWT_REFRESH_SECRET` | ✅ | ≥ 32 chars |
| `JWT_ACCESS_EXPIRES_IN` | | Access token TTL, default `15m` |
| `REFRESH_TOKEN_TTL_DAYS` | | Refresh token TTL, default `30` |
| `COOKIE_SECURE` | | **Must be `true` in production** — enforced at boot |
| `COOKIE_SAME_SITE` | | `lax` (default), `strict` or `none` |
| `CLIENT_URL` | | Used to build email links |
| `CORS_ORIGINS` | | Comma-separated exact origins; credentialed CORS forbids wildcards |
| `REDIS_ENABLED` / `REDIS_URL` | | Optional cache and shared rate-limit store |
| `CLOUDINARY_*` | | Image uploads; endpoints return 503 without them |
| `RAZORPAY_KEY_ID` / `_KEY_SECRET` | | Payments |
| `RAZORPAY_WEBHOOK_SECRET` | | Set in the Razorpay dashboard — **not** the API secret |
| `GOOGLE_CLIENT_ID` / `_CLIENT_SECRET` | | Google sign-in; must be set together or omitted together |
| `GOOGLE_REDIRECT_URI` | | Must match the console entry exactly, default is the dev proxy URL |
| `MAIL_DRIVER` | | Leave unset to auto-select; force with `console`, `smtp` or `resend` |
| `SMTP_SERVICE` | | Nodemailer well-known service (`gmail`, `outlook365`, …) instead of host/port |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_SECURE` | | Explicit relay; `587` + `false` = STARTTLS, `465` + `true` = implicit TLS |
| `SMTP_USER` / `SMTP_PASSWORD` | | Omit for unauthenticated local relays (MailHog, Mailpit) |
| `SMTP_POOL` | | Reuse one connection across a burst of mail, default `true` |
| `RATE_LIMIT_*`, `MAX_UPLOAD_*` | | Tunable limits |

The environment is parsed and validated by Zod at boot
([`server/src/config/env.ts`](server/src/config/env.ts)); a missing or invalid variable
fails fast with a readable list rather than surfacing as `undefined` at runtime.
`process.env` is not read anywhere else in the codebase.

Client variables must be prefixed `VITE_` and are **public** — never put a secret there.

---

## Database & migrations

PostgreSQL via Prisma. Schema: [`server/prisma/schema.prisma`](server/prisma/schema.prisma).

Models: `User`, `RefreshToken`, `VerificationToken`, `Address`, `Category`, `Brand`,
`Product`, `ProductImage`, `ProductVariant`, `ProductAttribute`, `Inventory`, `Cart`,
`CartItem`, `Wishlist`, `WishlistItem`, `Order`, `OrderItem`, `OrderEvent`, `Payment`,
`Coupon`, `CouponUsage`, `Review`, `ReviewImage`.

Three decisions worth knowing before reading the schema:

1. **Money is `Decimal(12,2)`, never a float.** Every conversion goes through
   [`utils/money.ts`](server/src/utils/money.ts) — including rupees → paise for Razorpay.
2. **Stock lives only in `Inventory`.** One row per sellable unit (a product without
   variants, or a single variant), with `quantity` (available) and `reserved` (held by
   unpaid orders). There is no duplicate `Product.stock` to drift out of sync.
3. **`OrderItem` is an immutable snapshot** of name, slug, SKU, image, unit price,
   quantity, line total and variant attributes. Editing a product later never rewrites
   order history.

```bash
npm run prisma:migrate      # create + apply a migration in development
npm run prisma:deploy       # apply pending migrations in production
npm run prisma:studio       # browse data
npm run db:reset            # drop, re-migrate and re-seed (destructive)
```

---

## Development commands

**Server** (`cd server`)

| Command | Description |
| ------- | ----------- |
| `npm run dev` | Watch mode via tsx |
| `npm run build` | Type-check, compile, resolve path aliases |
| `npm start` | Run the compiled build |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` / `lint:fix` | Type-aware ESLint |
| `npm test` / `test:watch` / `test:coverage` | Vitest (requires the local test files, excluded from this repository) |
| `npm run prisma:*` | generate · migrate · deploy · studio · seed |

**Client** (`cd client`)

| Command | Description |
| ------- | ----------- |
| `npm run dev` | Vite dev server with `/api` proxy |
| `npm run build` | Type-check + production bundle |
| `npm run preview` | Serve the production build locally |
| `npm run typecheck` / `lint` / `format` | Quality gates |

---

## API reference

Base URL `/api`. All responses share one envelope:

```jsonc
// success
{ "success": true, "data": { … }, "meta": { "page": 1, "limit": 20, "total": 137, "totalPages": 7 } }

// error
{ "success": false, "message": "Product not found", "code": "PRODUCT_NOT_FOUND" }
```

`code` is a stable machine-readable string — the client switches on it, never on message
text. Validation failures add `errors: [{ path, message }]`. Stack traces and internal
messages are never returned in production.

### Auth — `/api/auth`

| Method | Path | Auth | Description |
| ------ | ---- | ---- | ----------- |
| POST | `/register` | – | Create account, set cookies, send verification email |
| POST | `/login` | – | Set access + refresh cookies |
| POST | `/refresh` | cookie | Rotate the refresh token |
| POST | `/logout` | – | Revoke the token, clear cookies |
| POST | `/logout-all` | user | End every session |
| GET / PATCH | `/me` | user | Read / update profile |
| POST | `/change-password` | user | Change password, revoke all sessions |
| POST | `/forgot-password` | – | Email a reset link (always 200) |
| POST | `/reset-password` | – | Consume a reset token |
| POST | `/verify-email` · `/resend-verification` | – | Email verification |
| GET | `/google` | – | Redirect to Google's consent screen |
| GET | `/google/callback` | state | Exchange the code, set cookies, redirect back to the app |

### Catalogue — `/api/products`, `/api/categories`, `/api/brands`

| Method | Path | Auth | Description |
| ------ | ---- | ---- | ----------- |
| GET | `/products` | – | Search, filter, sort, paginate |
| GET | `/products/facets` | – | Price-range bounds for the filter UI |
| GET | `/products/:slug` | – | Detail (staff also see drafts) |
| GET | `/products/:slug/related` | – | Same-category products |
| GET | `/products/admin/all` · `/admin/:id` | STAFF+ | Admin listing including drafts |
| POST / PATCH | `/products[/:id]` | STAFF+ | Create / update |
| DELETE | `/products/:id` | ADMIN | Soft delete |
| POST | `/products/:id/images` | STAFF+ | Multipart upload to Cloudinary |
| PATCH | `/products/:id/inventory` | STAFF+ | Absolute set or relative delta |
| GET | `/categories`, `/brands` | – | Public reads (`?tree=true` for a nested tree) |
| POST / PATCH / DELETE | `/categories[/:id]`, `/brands[/:id]` | STAFF+ / ADMIN | Management |

**Product query parameters** — `q`, `category`, `categories`, `brand`, `brands`,
`minPrice`, `maxPrice`, `minRating`, `inStock`, `featured`, `tags`, `sort`
(`newest` · `oldest` · `price_asc` · `price_desc` · `rating` · `popular` · `name_asc` ·
`name_desc`), `page`, `limit`.

Search matches across name, short description, description, SKU, tags, brand name and
category name. Multiple terms are ANDed across terms and ORed across fields, so
"sony wireless" finds the Sony wireless headphones rather than everything Sony plus
everything wireless.

### Cart, wishlist, addresses

| Method | Path | Description |
| ------ | ---- | ----------- |
| GET | `/cart` | Server-recomputed cart with per-line availability issues |
| POST | `/cart/items` | Add (stock-checked) |
| PATCH / DELETE | `/cart/items/:id` | Set quantity (0 removes) / remove |
| DELETE | `/cart` | Clear |
| POST | `/cart/reconcile` | Drop unavailable lines, clamp quantities |
| GET / POST / DELETE | `/wishlist[/:productId]` | Wishlist (add is idempotent) |
| POST | `/wishlist/:productId/move-to-cart` | Move, re-running every cart rule |
| GET / POST / PATCH / DELETE | `/addresses[/:id]` | Address book |
| PATCH | `/addresses/:id/default` | Set default |

### Checkout, payments, orders

| Method | Path | Description |
| ------ | ---- | ----------- |
| POST | `/coupons/validate` | Preview a code against the live cart |
| POST | `/checkout` | Price the order, reserve stock, create a `PENDING` order |
| GET | `/payments/config` | Public Razorpay key id |
| POST | `/payments/create-order` | Create the gateway order for a stored total |
| POST | `/payments/verify` | HMAC-verify the browser handshake |
| POST | `/payments/webhook` | **Authoritative** signed callback (raw body) |
| GET | `/orders`, `/orders/:id` | Own orders + timeline |
| PATCH | `/orders/:id/cancel` · `/return` | Cancel / request a return |

`POST /checkout` accepts **only** `addressId`, an optional `couponCode`,
`paymentMethod` and `customerNote`. It accepts no prices, no totals and no item list —
there is no field through which a client could influence money.

### Reviews & admin

| Method | Path | Auth | Description |
| ------ | ---- | ---- | ----------- |
| GET | `/reviews/product/:slug` | – | Reviews + rating histogram |
| GET | `/reviews/eligibility/:productId` | user | May this user review? |
| POST / PATCH / DELETE | `/reviews[/:id]` | user | Own reviews (staff may delete any) |
| GET | `/admin/dashboard` | STAFF+ | KPIs, 30-day revenue series, best sellers, low stock |
| GET | `/admin/analytics/*` | STAFF+ | Revenue series, best sellers, low stock |
| GET | `/admin/orders[/:id]` | STAFF+ | All orders with search and filters |
| PATCH | `/admin/orders/:id/status` | STAFF+ | Whitelisted status transition |
| POST | `/admin/orders/:id/refund` | ADMIN | Razorpay refund |
| GET / PATCH | `/admin/users[/:id]` | ADMIN | Customer directory, role and activation |
| GET / PATCH | `/admin/reviews[/:id]` | STAFF+ | Review moderation |
| GET / POST / PATCH / DELETE | `/coupons[/:id]` | STAFF+ / ADMIN | Coupon management |

---

## Security

Implemented, and where to read it:

| Control | Location |
| ------- | -------- |
| Helmet, CSP, credentialed CORS allow-list | [`middleware/security.ts`](server/src/middleware/security.ts) |
| Layered rate limits (global, auth, sensitive, write, upload, checkout) | [`middleware/rateLimit.ts`](server/src/middleware/rateLimit.ts) |
| Zod validation that **replaces** `req.body`/`query`/`params` | [`middleware/validate.ts`](server/src/middleware/validate.ts) |
| HTTP-only, `SameSite`, `Secure` cookies | [`utils/cookies.ts`](server/src/utils/cookies.ts) |
| bcrypt (cost 12) + timing-equalised login | [`utils/password.ts`](server/src/utils/password.ts) |
| Refresh-token rotation with reuse detection | [`services/auth.service.ts`](server/src/services/auth.service.ts) |
| Role gates | [`middleware/auth.ts`](server/src/middleware/auth.ts) |
| Centralised error handling | [`middleware/errorHandler.ts`](server/src/middleware/errorHandler.ts) |
| Magic-number file validation | [`middleware/upload.ts`](server/src/middleware/upload.ts) |
| Razorpay signature + webhook verification | [`lib/razorpay.ts`](server/src/lib/razorpay.ts) |
| OAuth PKCE, `state` CSRF check, ID-token `iss`/`aud`/`exp` validation | [`lib/google.ts`](server/src/lib/google.ts) |
| Open-redirect guard on the OAuth callback | [`controllers/auth.controller.ts`](server/src/controllers/auth.controller.ts) |

**Mass assignment** — every request schema uses `.strict()`, and the validation
middleware *replaces* the request object with the parsed result. A body carrying
`"role": "ADMIN"` or `"total": 1` is rejected with a 422; even if it were not, nothing
downstream reads those fields.

**Refresh-token rotation** — refresh tokens are 64 random bytes stored only as a
SHA-256 hash, scoped to `/api/auth`, and carry a `familyId`. Presenting an
already-revoked token means it was replayed, so the entire family is revoked and the
session ends. A password change bumps `User.tokenVersion`, which invalidates every
outstanding access token immediately rather than at expiry.

**Never trusted from the client** — prices, stock, discount calculations, payment
status, roles. All are derived or verified server-side.

**Payment integrity** — an order becomes `PAID` only after
`HMAC_SHA256(order_id|payment_id, key_secret)` matches on `/payments/verify`, or the
webhook signature over the **raw request body** matches. Both paths converge on the same
idempotent handler, so whichever arrives second is a harmless no-op, and a customer who
closes the tab mid-payment still gets a confirmed order. The webhook additionally
refuses to settle if the amount paid differs from the amount billed.

**Overselling** — every stock mutation is a conditional atomic update:

```sql
UPDATE inventory SET quantity = quantity - n, reserved = reserved + n
WHERE id = ? AND quantity >= n
```

The database evaluates the guard and the write together, so two buyers racing for the
last unit cannot both succeed. Zero rows updated means the race was lost and the whole
checkout transaction rolls back. Read-then-write would oversell here, however short the
gap. See [`repositories/inventory.repository.ts`](server/src/repositories/inventory.repository.ts).

---

## Testing

Test files, test-runner configuration, QA scripts, coverage output and QA Markdown
reports are maintained locally and excluded from this repository. The test commands
in `server/package.json` require those local files; they are not runnable from this
repository alone. Source linting, type checking and production builds remain available.

---

## Production build & deployment

```bash
# API
cd server
npm ci
npm run prisma:generate
npm run prisma:deploy
npm run build
npm start

# Storefront — dist/ is static, serve from any CDN or static host
cd client
npm ci
npm run build
```

**Production checklist**

- [ ] `NODE_ENV=production` and `COOKIE_SECURE=true` (the boot check enforces this)
- [ ] Distinct, high-entropy `JWT_ACCESS_SECRET` and `JWT_REFRESH_SECRET`
- [ ] `CORS_ORIGINS` set to your exact storefront origin(s)
- [ ] Razorpay webhook pointed at `POST /api/payments/webhook` with the webhook secret
- [ ] `REDIS_ENABLED=true` if running more than one API instance, so rate limits are shared
- [ ] `trust proxy` matches your load balancer hop count (`app.ts`)
- [ ] `GET /health` wired to your platform's health probe

The SPA needs a history fallback — every unknown path should serve `index.html`.

---

## Project structure

```
Ecommerce/
├── ARCHITECTURE.md            # schema, API, auth and business-rule design
├── docker-compose.yml         # Postgres + Redis for local development
├── server/
│   ├── prisma/
│   │   ├── schema.prisma
│   │   └── seed.ts
│   ├── src/
│   │   ├── config/            # env parsing (zod), constants, pricing rules
│   │   ├── controllers/       # HTTP in/out only
│   │   ├── services/          # business rules, transactions
│   │   ├── repositories/      # Prisma access, select shapes
│   │   ├── routes/            # route tables per resource
│   │   ├── middleware/        # auth, rbac, validate, rate limit, upload, errors
│   │   ├── schemas/           # zod contracts + inferred types
│   │   ├── utils/             # ApiError, money, tokens, cookies, serializers
│   │   ├── lib/               # prisma, redis, cloudinary, razorpay, google, mailer, logger
│   │   ├── app.ts             # express wiring (no listen)
│   │   └── server.ts          # bootstrap + graceful shutdown
└── client/
    └── src/
        ├── app/store.ts       # Redux store
        ├── features/          # auth, cart, wishlist, ui, theme slices
        ├── lib/               # axios client, api modules, query client, utils
        ├── components/ui/     # design-system primitives
        ├── components/        # product, cart, account widgets
        ├── layouts/           # RootLayout, AdminLayout, Header, Footer
        ├── pages/             # storefront + admin screens (all lazy-loaded)
        ├── hooks/             # useCart, useWishlist, useCatalog, useToast
        ├── routes/            # router config + guards
        └── types/api.ts       # shared API types
```

---

## Licence

MIT. Built as a portfolio demonstration of production e-commerce patterns.
