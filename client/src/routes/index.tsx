import { lazy, Suspense } from 'react';
import { createBrowserRouter, Outlet } from 'react-router-dom';

import { PageLoader } from '@/components/ui/Feedback';
import { AdminLayout } from '@/layouts/AdminLayout';
import { RootLayout } from '@/layouts/RootLayout';
import { RedirectIfAuthenticated, RequireAuth, RequireRole } from '@/routes/guards';

/**
 * Every page is code-split. A first-time visitor landing on the homepage should not
 * download the admin dashboard and its charting library to render a product grid.
 */
const HomePage = lazy(() => import('@/pages/HomePage'));
const ProductsPage = lazy(() => import('@/pages/ProductsPage'));
const ProductDetailPage = lazy(() => import('@/pages/ProductDetailPage'));
const SearchPage = lazy(() => import('@/pages/SearchPage'));
const CartPage = lazy(() => import('@/pages/CartPage'));
const WishlistPage = lazy(() => import('@/pages/WishlistPage'));
const CheckoutPage = lazy(() => import('@/pages/CheckoutPage'));
const OrdersPage = lazy(() => import('@/pages/OrdersPage'));
const OrderDetailPage = lazy(() => import('@/pages/OrderDetailPage'));
const NotFoundPage = lazy(() => import('@/pages/NotFoundPage'));

const LoginPage = lazy(() => import('@/pages/auth/LoginPage'));
const RegisterPage = lazy(() => import('@/pages/auth/RegisterPage'));

const ProfilePage = lazy(() =>
  import('@/pages/AccountPages').then((module) => ({ default: module.ProfilePage })),
);
const AddressesPage = lazy(() =>
  import('@/pages/AccountPages').then((module) => ({ default: module.AddressesPage })),
);
const ForgotPasswordPage = lazy(() =>
  import('@/pages/auth/PasswordPages').then((module) => ({ default: module.ForgotPasswordPage })),
);
const ResetPasswordPage = lazy(() =>
  import('@/pages/auth/PasswordPages').then((module) => ({ default: module.ResetPasswordPage })),
);
const VerifyEmailPage = lazy(() =>
  import('@/pages/auth/PasswordPages').then((module) => ({ default: module.VerifyEmailPage })),
);

const AboutPage = lazy(() =>
  import('@/pages/CompanyPages').then((module) => ({ default: module.AboutPage })),
);
const ContactPage = lazy(() =>
  import('@/pages/CompanyPages').then((module) => ({ default: module.ContactPage })),
);
const CareersPage = lazy(() =>
  import('@/pages/CompanyPages').then((module) => ({ default: module.CareersPage })),
);
const PrivacyPage = lazy(() =>
  import('@/pages/CompanyPages').then((module) => ({ default: module.PrivacyPage })),
);

const AdminDashboard = lazy(() => import('@/pages/admin/AdminDashboard'));
const AdminProducts = lazy(() =>
  import('@/pages/admin/AdminProducts').then((module) => ({ default: module.AdminProducts })),
);
const AdminProductForm = lazy(() =>
  import('@/pages/admin/AdminProducts').then((module) => ({ default: module.AdminProductForm })),
);
const AdminOrders = lazy(() =>
  import('@/pages/admin/AdminOrders').then((module) => ({ default: module.AdminOrders })),
);
const AdminOrderDetail = lazy(() =>
  import('@/pages/admin/AdminOrders').then((module) => ({ default: module.AdminOrderDetail })),
);
const AdminCustomers = lazy(() =>
  import('@/pages/admin/AdminCustomers').then((module) => ({ default: module.AdminCustomers })),
);
const AdminCustomerDetail = lazy(() =>
  import('@/pages/admin/AdminCustomers').then((module) => ({ default: module.AdminCustomerDetail })),
);
const AdminCategories = lazy(() =>
  import('@/pages/admin/AdminTaxonomy').then((module) => ({ default: module.AdminCategories })),
);
const AdminBrands = lazy(() =>
  import('@/pages/admin/AdminTaxonomy').then((module) => ({ default: module.AdminBrands })),
);
const AdminCoupons = lazy(() =>
  import('@/pages/admin/AdminCoupons').then((module) => ({ default: module.AdminCoupons })),
);
const AdminAnalytics = lazy(() =>
  import('@/pages/admin/AdminCoupons').then((module) => ({ default: module.AdminAnalytics })),
);
const AdminReviews = lazy(() =>
  import('@/pages/admin/AdminReviews').then((module) => ({ default: module.AdminReviews })),
);

/** Suspense boundary shared by every lazy route. */
function LazyOutlet() {
  return (
    <Suspense fallback={<PageLoader />}>
      <Outlet />
    </Suspense>
  );
}

export const router = createBrowserRouter([
  {
    element: <RootLayout />,
    children: [
      {
        element: <LazyOutlet />,
        children: [
          // Public storefront
          { index: true, element: <HomePage /> },
          { path: 'products', element: <ProductsPage /> },
          { path: 'products/:slug', element: <ProductDetailPage /> },
          { path: 'category/:slug', element: <ProductsPage /> },
          { path: 'search', element: <SearchPage /> },

          // Company pages the footer links to
          { path: 'about', element: <AboutPage /> },
          { path: 'contact', element: <ContactPage /> },
          { path: 'careers', element: <CareersPage /> },
          { path: 'privacy', element: <PrivacyPage /> },

          // Auth (redirect away if already signed in)
          {
            path: 'login',
            element: (
              <RedirectIfAuthenticated>
                <LoginPage />
              </RedirectIfAuthenticated>
            ),
          },
          {
            path: 'register',
            element: (
              <RedirectIfAuthenticated>
                <RegisterPage />
              </RedirectIfAuthenticated>
            ),
          },
          { path: 'forgot-password', element: <ForgotPasswordPage /> },
          { path: 'reset-password', element: <ResetPasswordPage /> },
          { path: 'verify-email', element: <VerifyEmailPage /> },

          // Customer account
          {
            path: 'cart',
            element: (
              <RequireAuth>
                <CartPage />
              </RequireAuth>
            ),
          },
          {
            path: 'wishlist',
            element: (
              <RequireAuth>
                <WishlistPage />
              </RequireAuth>
            ),
          },
          {
            path: 'checkout',
            element: (
              <RequireAuth>
                <CheckoutPage />
              </RequireAuth>
            ),
          },
          {
            path: 'orders',
            element: (
              <RequireAuth>
                <OrdersPage />
              </RequireAuth>
            ),
          },
          {
            path: 'orders/:id',
            element: (
              <RequireAuth>
                <OrderDetailPage />
              </RequireAuth>
            ),
          },
          {
            path: 'profile',
            element: (
              <RequireAuth>
                <ProfilePage />
              </RequireAuth>
            ),
          },
          {
            path: 'addresses',
            element: (
              <RequireAuth>
                <AddressesPage />
              </RequireAuth>
            ),
          },

          { path: '*', element: <NotFoundPage /> },
        ],
      },
    ],
  },

  // Admin shell — its own layout, gated to STAFF and ADMIN.
  {
    path: '/admin',
    element: (
      <RequireRole roles={['ADMIN', 'STAFF']}>
        <AdminLayout />
      </RequireRole>
    ),
    children: [
      {
        element: <LazyOutlet />,
        children: [
          { index: true, element: <AdminDashboard /> },
          { path: 'analytics', element: <AdminAnalytics /> },
          { path: 'products', element: <AdminProducts /> },
          { path: 'products/create', element: <AdminProductForm /> },
          { path: 'products/:id', element: <AdminProductForm /> },
          { path: 'orders', element: <AdminOrders /> },
          { path: 'orders/:id', element: <AdminOrderDetail /> },
          { path: 'categories', element: <AdminCategories /> },
          { path: 'brands', element: <AdminBrands /> },
          { path: 'coupons', element: <AdminCoupons /> },
          { path: 'reviews', element: <AdminReviews /> },
          {
            path: 'customers',
            element: (
              <RequireRole roles={['ADMIN']}>
                <AdminCustomers />
              </RequireRole>
            ),
          },
          {
            path: 'customers/:id',
            element: (
              <RequireRole roles={['ADMIN']}>
                <AdminCustomerDetail />
              </RequireRole>
            ),
          },
        ],
      },
    ],
  },
]);
