import { useState } from 'react';
import { Link, NavLink, Outlet } from 'react-router-dom';
import {
  BarChart3,
  Boxes,
  ChevronLeft,
  LayoutDashboard,
  Menu,
  MessageSquare,
  Package,
  ShoppingCart,
  Tag,
  Ticket,
  Users,
  X,
} from 'lucide-react';

import { useAppSelector } from '@/app/store';
import { ThemeToggle } from '@/components/ui/ThemeToggle';
import { cn, initials } from '@/lib/utils';

const NAV_SECTIONS = [
  {
    title: 'Overview',
    items: [
      { to: '/admin', label: 'Dashboard', icon: LayoutDashboard, end: true },
      { to: '/admin/analytics', label: 'Analytics', icon: BarChart3, end: false },
    ],
  },
  {
    title: 'Catalogue',
    items: [
      { to: '/admin/products', label: 'Products', icon: Package, end: false },
      { to: '/admin/categories', label: 'Categories', icon: Boxes, end: false },
      { to: '/admin/brands', label: 'Brands', icon: Tag, end: false },
    ],
  },
  {
    title: 'Commerce',
    items: [
      { to: '/admin/orders', label: 'Orders', icon: ShoppingCart, end: false },
      { to: '/admin/coupons', label: 'Coupons', icon: Ticket, end: false },
      { to: '/admin/reviews', label: 'Reviews', icon: MessageSquare, end: false },
      { to: '/admin/customers', label: 'Customers', icon: Users, end: false },
    ],
  },
];

export function AdminLayout() {
  const user = useAppSelector((state) => state.auth.user);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    // The admin canvas is a subtle grey in light mode, but in dark it must sit *below*
    // the cards, so it drops to the canvas token rather than inverting to a lighter grey.
    <div className="min-h-screen bg-ink-50 dark:bg-canvas">
      {/* Mobile top bar */}
      <div className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-ink-200 bg-surface px-4 lg:hidden">
        <button
          type="button"
          onClick={() => setSidebarOpen(true)}
          aria-label="Open admin menu"
          className="rounded-lg p-2 text-ink-700 hover:bg-ink-100"
        >
          <Menu className="h-5 w-5" aria-hidden="true" />
        </button>
        <span className="font-semibold text-ink-900">Admin</span>
        <ThemeToggle className="ml-auto -mr-1" />
      </div>

      <div className="flex">
        {/* Sidebar */}
        <aside
          className={cn(
            'fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r border-ink-200 bg-surface',
            'transition-transform duration-200 lg:sticky lg:top-0 lg:h-screen lg:translate-x-0',
            sidebarOpen ? 'translate-x-0' : '-translate-x-full',
          )}
        >
          <div className="flex h-16 items-center justify-between border-b border-ink-200 px-5">
            <Link to="/admin" className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600 text-white">
                <LayoutDashboard className="h-4 w-4" aria-hidden="true" />
              </span>
              <span className="font-bold tracking-tight text-ink-900">ShopWave</span>
            </Link>
            <button
              type="button"
              onClick={() => setSidebarOpen(false)}
              aria-label="Close menu"
              className="rounded-lg p-1.5 text-ink-500 hover:bg-ink-100 lg:hidden"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>

          <nav aria-label="Admin" className="flex-1 space-y-6 overflow-y-auto px-3 py-5">
            {NAV_SECTIONS.map((section) => (
              <div key={section.title}>
                <p className="px-3 pb-2 text-xs font-semibold uppercase tracking-wider text-ink-400">
                  {section.title}
                </p>
                <ul className="space-y-0.5">
                  {section.items.map((item) => (
                    <li key={item.to}>
                      <NavLink
                        to={item.to}
                        end={item.end}
                        onClick={() => setSidebarOpen(false)}
                        className={({ isActive }) =>
                          cn(
                            'flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                            isActive
                              ? 'bg-brand-50 text-brand-800'
                              : 'text-ink-600 hover:bg-ink-50 hover:text-ink-900',
                          )
                        }
                      >
                        <item.icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                        {item.label}
                      </NavLink>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </nav>

          <div className="border-t border-ink-200 p-3">
            <div className="flex items-center gap-2.5 rounded-lg px-2 py-2">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-600 text-xs font-bold text-white">
                {initials(user?.firstName, user?.lastName)}
              </span>
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-ink-900">
                  {user?.firstName} {user?.lastName}
                </p>
                <p className="truncate text-xs text-ink-500">{user?.role}</p>
              </div>
            </div>

            <ThemeToggle showLabel className="mt-1 text-ink-600 hover:bg-ink-50" />

            <Link
              to="/"
              className="mt-1 flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-ink-600 hover:bg-ink-50"
            >
              <ChevronLeft className="h-4 w-4" aria-hidden="true" />
              Back to store
            </Link>
          </div>
        </aside>

        {sidebarOpen && (
          <div
            className="fixed inset-0 z-30 bg-slate-950/40 dark:bg-slate-950/60 lg:hidden"
            onClick={() => setSidebarOpen(false)}
            aria-hidden="true"
          />
        )}

        <main className="min-w-0 flex-1">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
