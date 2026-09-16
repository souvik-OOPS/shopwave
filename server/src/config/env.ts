import path from 'node:path';
import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

/**
 * A single parsed, validated view of the environment. Importing anything other than
 * `env` from here is a mistake — `process.env` is not read anywhere else in the app.
 */
const booleanish = z
  .union([z.boolean(), z.string()])
  .transform((value) => (typeof value === 'boolean' ? value : ['1', 'true', 'yes'].includes(value.toLowerCase())));

const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().positive().default(5000),
    API_PREFIX: z.string().default('/api'),

    DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),

    JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET must be at least 32 characters'),
    JWT_REFRESH_SECRET: z.string().min(32, 'JWT_REFRESH_SECRET must be at least 32 characters'),
    JWT_ACCESS_EXPIRES_IN: z.string().default('15m'),
    REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(30),

    COOKIE_DOMAIN: z.string().optional(),
    COOKIE_SECURE: booleanish.default(false),
    COOKIE_SAME_SITE: z.enum(['lax', 'strict', 'none']).default('lax'),

    CLIENT_URL: z.string().url().default('http://localhost:5173'),
    CORS_ORIGINS: z.string().default('http://localhost:5173'),

    REDIS_URL: z.string().optional(),
    REDIS_ENABLED: booleanish.default(false),

    CLOUDINARY_CLOUD_NAME: z.string().optional(),
    CLOUDINARY_API_KEY: z.string().optional(),
    CLOUDINARY_API_SECRET: z.string().optional(),
    CLOUDINARY_FOLDER: z.string().default('shopwave'),

    RAZORPAY_KEY_ID: z.string().optional(),
    RAZORPAY_KEY_SECRET: z.string().optional(),
    RAZORPAY_WEBHOOK_SECRET: z.string().optional(),

    // Google sign-in. Optional as a pair: unset both and the endpoints answer 503
    // rather than the app refusing to boot.
    GOOGLE_CLIENT_ID: z.string().optional(),
    GOOGLE_CLIENT_SECRET: z.string().optional(),
    /**
     * Must match a redirect URI registered in the Google Cloud console *exactly*.
     * Defaults to the API's own callback behind the dev proxy, which keeps the
     * cookies Google's redirect lands on first-party.
     */
    GOOGLE_REDIRECT_URI: z.string().url().default('http://localhost:5173/api/auth/google/callback'),

    // Left optional on purpose: an unset driver is *resolved* from what is configured
    // (see `mailDriver` below) so adding SMTP credentials is enough to start sending.
    MAIL_DRIVER: z.enum(['smtp', 'resend', 'console']).optional(),
    MAIL_FROM: z.string().default('ShopWave <no-reply@shopwave.test>'),
    /** Nodemailer well-known service shortcut ("gmail", "outlook365", …) — replaces host/port. */
    SMTP_SERVICE: z.string().optional(),
    SMTP_HOST: z.string().optional(),
    SMTP_PORT: z.coerce.number().int().positive().default(587),
    SMTP_SECURE: booleanish.default(false),
    SMTP_USER: z.string().optional(),
    SMTP_PASSWORD: z.string().optional(),
    /** Reuse one connection for a burst of mail (order confirmations) instead of dialling per message. */
    SMTP_POOL: booleanish.default(true),
    RESEND_API_KEY: z.string().optional(),

    RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(15 * 60 * 1000),
    RATE_LIMIT_MAX: z.coerce.number().int().positive().default(300),
    AUTH_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(10),

    MAX_REQUEST_BODY_SIZE: z.string().default('100kb'),
    MAX_UPLOAD_FILE_SIZE_MB: z.coerce.number().positive().default(5),
    MAX_UPLOAD_FILES: z.coerce.number().int().positive().default(8),

    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  })
  .superRefine((value, ctx) => {
    if (value.NODE_ENV === 'production') {
      if (!value.COOKIE_SECURE) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['COOKIE_SECURE'],
          message: 'COOKIE_SECURE must be true in production',
        });
      }
      if (value.JWT_ACCESS_SECRET === value.JWT_REFRESH_SECRET) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['JWT_REFRESH_SECRET'],
          message: 'Access and refresh secrets must differ',
        });
      }
    }

    // Half-configured OAuth fails at the token exchange with an opaque Google error;
    // catching it at boot points at the actual missing variable.
    if (Boolean(value.GOOGLE_CLIENT_ID) !== Boolean(value.GOOGLE_CLIENT_SECRET)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['GOOGLE_CLIENT_SECRET'],
        message: 'GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must be set together',
      });
    }
  });

export type Env = z.infer<typeof envSchema>;

/**
 * `KEY=` in a `.env` file parses as an empty string, not as an absent key — and an empty
 * string is neither `undefined` (so `.default()` never fires and `.optional()` happily
 * accepts it) nor falsy in every check that reads it. That mismatch turns a blank line
 * into a boot failure on an enum, or into a feature silently disabled while its real
 * setting sits right next to it. Blank means "not set", everywhere, once, here.
 */
function withoutBlankValues(source: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const cleaned: NodeJS.ProcessEnv = {};

  for (const [key, value] of Object.entries(source)) {
    if (typeof value === 'string' && value.trim() === '') continue;
    cleaned[key] = value;
  }

  return cleaned;
}

function loadEnv(): Env {
  const parsed = envSchema.safeParse(withoutBlankValues(process.env));

  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `  • ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    // Deliberately not the logger: this runs before the logger is configured.
    console.error(`\n✖ Invalid environment configuration:\n${details}\n`);
    throw new Error('Environment validation failed');
  }

  return parsed.data;
}

export const env = loadEnv();

export const isProduction = env.NODE_ENV === 'production';
export const isTest = env.NODE_ENV === 'test';
export const isDevelopment = env.NODE_ENV === 'development';

export const corsOrigins = env.CORS_ORIGINS.split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

export const isCloudinaryConfigured = Boolean(
  env.CLOUDINARY_CLOUD_NAME && env.CLOUDINARY_API_KEY && env.CLOUDINARY_API_SECRET,
);

export const isRazorpayConfigured = Boolean(env.RAZORPAY_KEY_ID && env.RAZORPAY_KEY_SECRET);

export const isGoogleAuthConfigured = Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);

/**
 * SMTP is usable once we know *where* to connect; auth is optional (local relays, MailHog).
 * `||` rather than `??`: a service that is present but empty must fall through to the
 * host, not shadow it.
 */
export const isSmtpConfigured = Boolean(env.SMTP_SERVICE || env.SMTP_HOST);

/**
 * The driver actually used at runtime. An explicit `MAIL_DRIVER` always wins; otherwise
 * SMTP (Nodemailer) is preferred as soon as it is configured, then Resend, then the
 * console driver so a fresh clone still boots with no mail credentials at all.
 */
export const mailDriver: 'smtp' | 'resend' | 'console' =
  env.MAIL_DRIVER ?? (isSmtpConfigured ? 'smtp' : env.RESEND_API_KEY ? 'resend' : 'console');
