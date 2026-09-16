import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Check, Eye, EyeOff, Lock, Mail, Phone, User } from 'lucide-react';

import { useAppDispatch, useAppSelector } from '@/app/store';
import { register as registerThunk } from '@/features/auth/authSlice';
import { AuthDivider, GoogleButton } from '@/components/auth/GoogleButton';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { useToast } from '@/hooks/useToast';
import { AuthShell } from '@/pages/auth/AuthShell';
import { cn } from '@/lib/utils';

/**
 * Mirrors the server's password policy exactly. Client validation is for fast feedback
 * only — the same rules are enforced again by Zod on the API.
 */
const registerSchema = z
  .object({
    firstName: z.string().trim().min(1, 'First name is required').max(60),
    lastName: z.string().trim().min(1, 'Last name is required').max(60),
    email: z.string().min(1, 'Email is required').email('Enter a valid email address'),
    phone: z
      .string()
      .trim()
      .regex(/^(?:\+91[-\s]?|0)?[6-9]\d{9}$/, 'Enter a valid 10-digit Indian mobile number')
      .optional()
      .or(z.literal('')),
    password: z
      .string()
      .min(8, 'At least 8 characters')
      .regex(/[a-z]/, 'Must include a lowercase letter')
      .regex(/[A-Z]/, 'Must include an uppercase letter')
      .regex(/[0-9]/, 'Must include a number'),
    confirmPassword: z.string().min(1, 'Please confirm your password'),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });

type RegisterValues = z.infer<typeof registerSchema>;

const RULES = [
  { label: 'At least 8 characters', test: (value: string) => value.length >= 8 },
  { label: 'One lowercase letter', test: (value: string) => /[a-z]/.test(value) },
  { label: 'One uppercase letter', test: (value: string) => /[A-Z]/.test(value) },
  { label: 'One number', test: (value: string) => /[0-9]/.test(value) },
];

export default function RegisterPage() {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const toast = useToast();
  const status = useAppSelector((state) => state.auth.status);
  const [showPassword, setShowPassword] = useState(false);

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<RegisterValues>({ resolver: zodResolver(registerSchema), mode: 'onBlur' });

  const password = watch('password') ?? '';

  async function onSubmit(values: RegisterValues) {
    const result = await dispatch(
      registerThunk({
        firstName: values.firstName,
        lastName: values.lastName,
        email: values.email,
        password: values.password,
        ...(values.phone ? { phone: values.phone } : {}),
      }),
    );

    if (registerThunk.fulfilled.match(result)) {
      toast.success('Account created', 'Check your inbox to verify your email address.');
      navigate('/', { replace: true });
    } else {
      toast.error(result.payload ?? 'Unable to create your account');
    }
  }

  return (
    <AuthShell
      title="Create your account"
      subtitle="It takes under a minute, and your cart follows you everywhere."
      footer={
        <p className="text-sm text-ink-600">
          Already have an account?{' '}
          <Link to="/login" className="font-semibold text-brand-700 hover:underline">
            Sign in
          </Link>
        </p>
      }
    >
      <GoogleButton label="Sign up with Google" />

      <AuthDivider label="or use your email" />

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="First name"
            autoComplete="given-name"
            leftIcon={<User className="h-4 w-4" aria-hidden="true" />}
            error={errors.firstName?.message}
            {...register('firstName')}
          />
          <Input
            label="Last name"
            autoComplete="family-name"
            error={errors.lastName?.message}
            {...register('lastName')}
          />
        </div>

        <Input
          label="Email address"
          type="email"
          autoComplete="email"
          placeholder="you@example.com"
          leftIcon={<Mail className="h-4 w-4" aria-hidden="true" />}
          error={errors.email?.message}
          {...register('email')}
        />

        <Input
          label="Mobile number"
          type="tel"
          autoComplete="tel"
          placeholder="9876543210"
          hint="Optional — used for delivery updates"
          leftIcon={<Phone className="h-4 w-4" aria-hidden="true" />}
          error={errors.phone?.message}
          {...register('phone')}
        />

        <Input
          label="Password"
          type={showPassword ? 'text' : 'password'}
          autoComplete="new-password"
          leftIcon={<Lock className="h-4 w-4" aria-hidden="true" />}
          error={errors.password?.message}
          rightSlot={
            <button
              type="button"
              onClick={() => setShowPassword((value) => !value)}
              aria-label={showPassword ? 'Hide password' : 'Show password'}
              className="rounded p-1.5 text-ink-400 hover:text-ink-700"
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          }
          {...register('password')}
        />

        {password.length > 0 && (
          <ul className="grid grid-cols-2 gap-1.5" aria-label="Password requirements">
            {RULES.map((rule) => {
              const passed = rule.test(password);
              return (
                <li
                  key={rule.label}
                  className={cn(
                    'flex items-center gap-1.5 text-xs',
                    passed ? 'text-success-700' : 'text-ink-400',
                  )}
                >
                  <Check className={cn('h-3.5 w-3.5', !passed && 'opacity-40')} aria-hidden="true" />
                  {rule.label}
                </li>
              );
            })}
          </ul>
        )}

        <Input
          label="Confirm password"
          type={showPassword ? 'text' : 'password'}
          autoComplete="new-password"
          leftIcon={<Lock className="h-4 w-4" aria-hidden="true" />}
          error={errors.confirmPassword?.message}
          {...register('confirmPassword')}
        />

        <Button type="submit" fullWidth size="lg" loading={status === 'loading'}>
          Create account
        </Button>
      </form>
    </AuthShell>
  );
}
