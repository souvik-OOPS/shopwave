import { useEffect } from 'react';
import { Outlet, useLocation } from 'react-router-dom';

import { useAppDispatch } from '@/app/store';
import { closeAllOverlays } from '@/features/ui/uiSlice';
import { CartDrawer } from '@/components/cart/CartDrawer';
import { Footer } from '@/layouts/Footer';
import { Header } from '@/layouts/Header';
import { useCart } from '@/hooks/useCart';
import { useWishlistSync } from '@/hooks/useWishlist';

export function RootLayout() {
  const dispatch = useAppDispatch();
  const location = useLocation();

  // Warm the cart and wishlist once for the whole shell, so the header badges are
  // populated before the user opens either.
  useCart();
  useWishlistSync();

  useEffect(() => {
    // A route change must not leave the cart drawer or mobile nav hanging open.
    dispatch(closeAllOverlays());
    window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
  }, [location.pathname, dispatch]);

  return (
    <div className="flex min-h-screen flex-col">
      <a href="#main-content" className="skip-link">
        Skip to content
      </a>

      <Header />

      <main id="main-content" className="flex-1">
        <Outlet />
      </main>

      <Footer />
      <CartDrawer />
    </div>
  );
}
