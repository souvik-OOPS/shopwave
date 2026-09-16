import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation } from '@tanstack/react-query';
import { CheckCircle2, Lock, Mail, XCircle } from 'lucide-react';

import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Spinner } from '@/components/ui/Feedback';
import { authApi } from '@/lib/api';
import { useToast } from '@/hooks/useToast';
import { AuthShell } from '@/pages/auth/AuthShell';

// ── Forgot password ─────────────────────────────────────────────────────────

const forgotSchema = z.object({
  email: z.string().min(1, 'Email is required').email('Enter a valid email address'),
});

export function ForgotPasswordPage() {
  const toast = useToast();
  const [sent, setSent] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<z.infer<typeof forgotSchema>>({ resolver: zodResolver(forgotSchema) });

  const mutation = useMutation({
    mutationFn: (email: string) => authApi.forgotPassword(email),
    // The server answers identically whether or not the account exists, so the UI must
    // not reveal anything either.
    onSuccess: () => setSent(true),
    onError: (error) => toast.error(error),
  });

  if (sent) {
    return (
      <AuthShell title="Check your inbox" subtitle="If that email is registered, a reset link is on its way.">
        <div className="rounded-xl border border-success-500/30 bg-success-50 p-4">
          <CheckCircle2 className="h-6 w-6 text-success-600" aria-hidden="true" />
          <p className="mt-2 text-sm text-ink-700">
            The link expires in one hour and can only be used once. If it does not arrive, check your
            spam folder.
          </p>
        </div>
        <Link to="/login" className="mt-6 inline-block text-sm font-semibold text-brand-700 hover:underline">
          Back to sign in
        </Link>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Reset your password"
      subtitle="Enter your email and we'll send you a link to choose a new one."
      footer={
        <Link to="/login" className="text-sm font-semibold text-brand-700 hover:underline">
          Back to sign in
        </Link>
      }
    >
      <form
        onSubmit={handleSubmit((values) => mutation.mutate(values.email))}
        className="space-y-4"
        noValidate
      >
        <Input
          label="Email address"
          type="email"
          autoComplete="email"
          placeholder="you@example.com"
          leftIcon={<Mail className="h-4 w-4" aria-hidden="true" />}
          error={errors.email?.message}
          {...register('email')}
        />
        <Button type="submit" fullWidth size="lg" loading={mutation.isPending}>
          Send reset link
        </Button>
      </form>
    </AuthShell>
  );
}

// ── Reset password ──────────────────────────────────────────────────────────

const resetSchema = z
  .object({
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

export function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const toast = useToast();
  const token = searchParams.get('token') ?? '';

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<z.infer<typeof resetSchema>>({ resolver: zodResolver(resetSchema) });

  const mutation = useMutation({
    mutationFn: (password: string) => authApi.resetPassword({ token, password }),
    onSuccess: () => {
      toast.success('Password updated', 'You can now sign in with your new password.');
      navigate('/login', { replace: true });
    },
    onError: (error) => toast.error(error),
  });

  if (!token) {
    return (
      <AuthShell title="Invalid link" subtitle="This password reset link is missing or malformed.">
        <div className="rounded-xl border border-danger-500/30 bg-danger-50 p-4">
          <XCircle className="h-6 w-6 text-danger-600" aria-hidden="true" />
          <p className="mt-2 text-sm text-ink-700">
            Request a fresh link — reset links expire after one hour.
          </p>
        </div>
        <Button className="mt-6" onClick={() => navigate('/forgot-password')}>
          Request a new link
        </Button>
      </AuthShell>
    );
  }

  return (
    <AuthShell title="Choose a new password" subtitle="Pick something you have not used before.">
      <form
        onSubmit={handleSubmit((values) => mutation.mutate(values.password))}
        className="space-y-4"
        noValidate
      >
        <Input
          label="New password"
          type="password"
          autoComplete="new-password"
          leftIcon={<Lock className="h-4 w-4" aria-hidden="true" />}
          error={errors.password?.message}
          {...register('password')}
        />
        <Input
          label="Confirm new password"
          type="password"
          autoComplete="new-password"
          leftIcon={<Lock className="h-4 w-4" aria-hidden="true" />}
          error={errors.confirmPassword?.message}
          {...register('confirmPassword')}
        />
        <Button type="submit" fullWidth size="lg" loading={mutation.isPending}>
          Update password
        </Button>
      </form>
    </AuthShell>
  );
}

// ── Email verification ──────────────────────────────────────────────────────

export function VerifyEmailPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') ?? '';
  const [state, setState] = useState<'verifying' | 'success' | 'error'>('verifying');

  useEffect(() => {
    if (!token) {
      setState('error');
      return;
    }

    authApi
      .verifyEmail(token)
      .then(() => setState('success'))
      .catch(() => setState('error'));
  }, [token]);

  return (
    <AuthShell
      title={
        state === 'verifying'
          ? 'Verifying your email'
          : state === 'success'
            ? 'Email verified'
            : 'Verification failed'
      }
      subtitle={
        state === 'verifying'
          ? 'This will only take a moment.'
          : state === 'success'
            ? 'Your account is fully activated.'
            : 'This link is invalid or has already expired.'
      }
    >
      {state === 'verifying' && (
        <div className="flex justify-center py-8">
          <Spinner className="h-8 w-8" label="Verifying" />
        </div>
      )}

      {state === 'success' && (
        <>
          <div className="rounded-xl border border-success-500/30 bg-success-50 p-4">
            <CheckCircle2 className="h-6 w-6 text-success-600" aria-hidden="true" />
            <p className="mt-2 text-sm text-ink-700">Thanks — everything is set up.</p>
          </div>
          <Button className="mt-6" fullWidth onClick={() => window.location.assign('/')}>
            Start shopping
          </Button>
        </>
      )}

      {state === 'error' && (
        <>
          <div className="rounded-xl border border-danger-500/30 bg-danger-50 p-4">
            <XCircle className="h-6 w-6 text-danger-600" aria-hidden="true" />
            <p className="mt-2 text-sm text-ink-700">
              Verification links expire after 24 hours. Sign in and request a new one.
            </p>
          </div>
          <Link to="/login" className="mt-6 inline-block text-sm font-semibold text-brand-700 hover:underline">
            Back to sign in
          </Link>
        </>
      )}
    </AuthShell>
  );
}
