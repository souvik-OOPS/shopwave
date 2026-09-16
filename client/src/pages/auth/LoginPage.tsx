import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Eye, EyeOff, Lock, Mail } from 'lucide-react';

import { useAppDispatch, useAppSelector } from '@/app/store';
import { login } from '@/features/auth/authSlice';
import { AuthDivider, GoogleButton } from '@/components/auth/GoogleButton';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { useToast } from '@/hooks/useToast';
import { AuthShell } from '@/pages/auth/AuthShell';

const loginSchema = z.object({
  email: z.string().min(1, 'Email is required').email('Enter a valid email address'),
  password: z.string().min(1, 'Password is required'),
});

type LoginValues = z.infer<typeof loginSchema>;

/**
 * The Google flow ends in a redirect, so a failure has no response body to read — the
 * API puts its stable error code on the query string instead and it is translated here.
 */
const OAUTH_ERRORS: Record<string, string> = {
  OAUTH_CANCELLED: 'Google sign-in was cancelled.',
  OAUTH_STATE_MISMATCH: 'That sign-in attempt expired. Please try again.',
  OAUTH_EMAIL_UNVERIFIED: 'Your Google account has no verified email address.',
  OAUTH_NOT_CONFIGURED: 'Google sign-in is not available right now.',
  ACCOUNT_DISABLED: 'This account has been disabled. Contact support for help.',
};

export default function LoginPage() {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const location = useLocation();
  const toast = useToast();
  const status = useAppSelector((state) => state.auth.status);
  const [showPassword, setShowPassword] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginValues>({ resolver: zodResolver(loginSchema) });

  // Set by RequireAuth when it intercepted a protected route.
  const redirectTo = (location.state as { from?: string } | null)?.from ?? '/';

  const [searchParams, setSearchParams] = useSearchParams();
  const oauthError = searchParams.get('error');

  useEffect(() => {
    if (!oauthError) return;

    toast.error(OAUTH_ERRORS[oauthError] ?? 'Could not complete Google sign-in. Please try again.');
    // Clear it so a refresh — or a later failed password attempt — does not re-toast.
    setSearchParams({}, { replace: true });
  }, [oauthError, setSearchParams, toast]);

  async function onSubmit(values: LoginValues) {
    const result = await dispatch(login(values));

    if (login.fulfilled.match(result)) {
      toast.success(`Welcome back, ${result.payload.firstName}`);
      navigate(redirectTo, { replace: true });
    } else {
      toast.error(result.payload ?? 'Unable to sign in');
    }
  }

  return (
    <AuthShell
      title="Welcome back"
      subtitle="Sign in to track orders, save favourites and check out faster."
      footer={
        <p className="text-sm text-ink-600">
          New to ShopWave?{' '}
          <Link to="/register" className="font-semibold text-brand-700 hover:underline">
            Create an account
          </Link>
        </p>
      }
    >
      <GoogleButton redirectTo={redirectTo} />

      <AuthDivider label="or sign in with email" />

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
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
          label="Password"
          type={showPassword ? 'text' : 'password'}
          autoComplete="current-password"
          placeholder="Enter your password"
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

        <div className="flex justify-end">
          <Link to="/forgot-password" className="text-sm font-medium text-brand-700 hover:underline">
            Forgot password?
          </Link>
        </div>

        <Button type="submit" fullWidth size="lg" loading={status === 'loading'}>
          Sign in
        </Button>
      </form>

      <div className="mt-6 rounded-xl border border-ink-200 bg-ink-50 p-3.5">
        <p className="text-xs font-semibold text-ink-700">Demo accounts</p>
        <p className="mt-1 text-xs leading-relaxed text-ink-500">
          Customer — customer@shopwave.test / Customer@1234
          <br />
          Admin — admin@shopwave.test / Admin@1234
        </p>
      </div>
    </AuthShell>
  );
}
