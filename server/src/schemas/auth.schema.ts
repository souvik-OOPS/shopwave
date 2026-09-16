import { z } from 'zod';

import { emailSchema, nonEmptyString, passwordSchema, phoneSchema } from '@/schemas/common.schema';

/**
 * `.strict()` throughout: an unexpected key is an error, not something to ignore.
 * That is what stops a request from smuggling `"role": "ADMIN"` into a registration.
 */
export const registerSchema = z
  .object({
    firstName: nonEmptyString(60, 'First name'),
    lastName: nonEmptyString(60, 'Last name'),
    email: emailSchema,
    password: passwordSchema,
    phone: phoneSchema.optional(),
  })
  .strict();

export const loginSchema = z
  .object({
    email: emailSchema,
    password: z.string().min(1, 'Password is required').max(128),
  })
  .strict();

export const forgotPasswordSchema = z.object({ email: emailSchema }).strict();

export const resetPasswordSchema = z
  .object({
    token: z.string().min(10, 'Reset token is required').max(512),
    password: passwordSchema,
  })
  .strict();

export const verifyEmailSchema = z
  .object({ token: z.string().min(10, 'Verification token is required').max(512) })
  .strict();

export const resendVerificationSchema = z.object({ email: emailSchema }).strict();

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Current password is required').max(128),
    newPassword: passwordSchema,
  })
  .strict()
  .refine((data) => data.currentPassword !== data.newPassword, {
    message: 'New password must be different from the current one',
    path: ['newPassword'],
  });

export const updateProfileSchema = z
  .object({
    firstName: nonEmptyString(60, 'First name').optional(),
    lastName: nonEmptyString(60, 'Last name').optional(),
    phone: phoneSchema.nullable().optional(),
  })
  .strict()
  .refine((data) => Object.keys(data).length > 0, { message: 'Provide at least one field to update' });

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
export type VerifyEmailInput = z.infer<typeof verifyEmailSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
