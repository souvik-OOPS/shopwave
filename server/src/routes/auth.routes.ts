import { Router } from 'express';

import { authController } from '@/controllers/auth.controller';
import { requireAuth } from '@/middleware/auth';
import { authLimiter, oauthLimiter, sensitiveLimiter } from '@/middleware/rateLimit';
import { validateBody } from '@/middleware/validate';
import {
  changePasswordSchema,
  forgotPasswordSchema,
  loginSchema,
  registerSchema,
  resendVerificationSchema,
  resetPasswordSchema,
  updateProfileSchema,
  verifyEmailSchema,
} from '@/schemas/auth.schema';

const router = Router();

// Public — rate limited because these are the credential-guessing surface.
router.post('/register', authLimiter, validateBody(registerSchema), authController.register);
router.post('/login', authLimiter, validateBody(loginSchema), authController.login);
router.post('/refresh', authController.refresh);
router.post('/logout', authController.logout);

// Google OAuth. GET, because the browser navigates here — and because the callback URL
// is Google's to call, not ours. Both legs answer with a redirect, never JSON.
// `oauthLimiter` is keyed on IP alone: there is no email in a redirect to key on.
router.get('/google', oauthLimiter, authController.googleStart);
router.get('/google/callback', oauthLimiter, authController.googleCallback);

// Public but expensive (each one sends an email) — tighter bucket.
router.post(
  '/forgot-password',
  sensitiveLimiter,
  validateBody(forgotPasswordSchema),
  authController.forgotPassword,
);
router.post('/reset-password', sensitiveLimiter, validateBody(resetPasswordSchema), authController.resetPassword);
router.post('/verify-email', validateBody(verifyEmailSchema), authController.verifyEmail);
router.post(
  '/resend-verification',
  sensitiveLimiter,
  validateBody(resendVerificationSchema),
  authController.resendVerification,
);

// Authenticated
router.get('/me', requireAuth, authController.me);
router.patch('/me', requireAuth, validateBody(updateProfileSchema), authController.updateProfile);
router.post('/change-password', requireAuth, validateBody(changePasswordSchema), authController.changePassword);
router.post('/logout-all', requireAuth, authController.logoutAll);

export default router;
