import type { Role } from '@prisma/client';

declare global {
  namespace Express {
    interface AuthenticatedUser {
      id: string;
      email: string;
      role: Role;
      tokenVersion: number;
    }

    interface Request {
      /** Populated by `requireAuth` / `optionalAuth`. */
      user?: AuthenticatedUser;
      /** Raw body preserved for the Razorpay webhook signature check. */
      rawBody?: Buffer;
      id?: string;
    }
  }
}

export {};
