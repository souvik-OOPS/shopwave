import { useEffect } from 'react';
import { RouterProvider } from 'react-router-dom';

import { useAppDispatch } from '@/app/store';
import { bootstrapSession } from '@/features/auth/authSlice';
import { Toaster } from '@/components/ui/Toaster';
import { useTheme } from '@/hooks/useTheme';
import { router } from '@/routes';

export function App() {
  const dispatch = useAppDispatch();

  // Owns the `dark` class on <html> and the OS-preference subscription for the whole app.
  useTheme();

  // One call on mount asks the server who the cookie belongs to. Until it resolves,
  // route guards hold rather than assuming the visitor is signed out.
  useEffect(() => {
    void dispatch(bootstrapSession());
  }, [dispatch]);

  return (
    <>
      <RouterProvider router={router} />
      <Toaster />
    </>
  );
}
