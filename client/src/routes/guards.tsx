import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';

import { useAppSelector } from '@/app/store';
import { PageLoader } from '@/components/ui/Feedback';
import type { Role } from '@/types/api';

/**
 * Route guards must not decide anything until the session bootstrap has completed —
 * redirecting on `user === null` during the first render would bounce every signed-in
 * user to the login page on a hard refresh.
 */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { user, initialised } = useAppSelector((state) => state.auth);
  const location = useLocation();

  if (!initialised) return <PageLoader label="Checking your session" />;

  if (!user) {
    // Remember where they were headed so login can send them back.
    return <Navigate to="/login" state={{ from: location.pathname + location.search }} replace />;
  }

  return <>{children}</>;
}

export function RequireRole({ roles, children }: { roles: Role[]; children: ReactNode }) {
  const { user, initialised } = useAppSelector((state) => state.auth);
  const location = useLocation();

  if (!initialised) return <PageLoader label="Checking permissions" />;
  if (!user) return <Navigate to="/login" state={{ from: location.pathname }} replace />;

  // This is a UX guard, not a security boundary — the API enforces roles independently.
  if (!roles.includes(user.role)) return <Navigate to="/" replace />;

  return <>{children}</>;
}

/** Keeps signed-in users off the login/register screens. */
export function RedirectIfAuthenticated({ children }: { children: ReactNode }) {
  const { user, initialised } = useAppSelector((state) => state.auth);

  if (!initialised) return <PageLoader />;
  if (user) return <Navigate to="/" replace />;

  return <>{children}</>;
}
