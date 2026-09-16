import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import {
  Heart,
  LayoutDashboard,
  LogOut,
  Menu,
  Package,
  Search,
  ShoppingBag,
  User as UserIcon,
  X,
} from 'lucide-react';

import { useAppDispatch, useAppSelector } from '@/app/store';
import { logout } from '@/features/auth/authSlice';
import { setMobileNavOpen, toggleCartDrawer } from '@/features/ui/uiSlice';
import { Button } from '@/components/ui/Button';
import { ThemeToggle } from '@/components/ui/ThemeToggle';
import { useCategories } from '@/hooks/useCatalog';
import { cn, initials } from '@/lib/utils';

function CountBadge({ count }: { count: number }) {
  if (count <= 0) return null;

  return (
    <span
      className="absolute -right-1 -top-1 flex h-[18px] min-w-[18px] items-center justify-center
                 rounded-full bg-brand-600 px-1 text-[10px] font-bold text-white"
      aria-hidden="true"
    >
      {count > 99 ? '99+' : count}
    </span>
  );
}

function AccountMenu() {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const user = useAppSelector((state) => state.auth.user);
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close on outside click / Escape — expected behaviour for any popover.
  useEffect(() => {
    if (!open) return undefined;

    function handlePointerDown(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
    }

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  if (!user) {
    return (
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={() => navigate('/login')}>
          Sign in
        </Button>
        <Button size="sm" className="hidden sm:inline-flex" onClick={() => navigate('/register')}>
          Create account
        </Button>
      </div>
    );
  }

  const isStaff = user.role === 'ADMIN' || user.role === 'STAFF';

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-haspopup="menu"
        className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-600 text-sm font-bold
                   text-white transition-transform hover:scale-105 focus-visible:ring-2 focus-visible:ring-brand-500"
      >
        {user.avatarUrl ? (
          <img src={user.avatarUrl} alt="" className="h-full w-full rounded-full object-cover" />
        ) : (
          initials(user.firstName, user.lastName)
        )}
        <span className="sr-only">Account menu</span>
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-11 z-50 w-60 animate-slide-up overflow-hidden rounded-xl
                     border border-ink-200 bg-surface-raised shadow-popover"
        >
          <div className="border-b border-ink-100 px-4 py-3">
            <p className="truncate text-sm font-semibold text-ink-900">
              {user.firstName} {user.lastName}
            </p>
            <p className="truncate text-xs text-ink-500">{user.email}</p>
          </div>

          <nav className="py-1">
            {[
              { to: '/profile', label: 'My profile', icon: UserIcon },
              { to: '/orders', label: 'My orders', icon: Package },
              { to: '/wishlist', label: 'Wishlist', icon: Heart },
            ].map(({ to, label, icon: Icon }) => (
              <Link
                key={to}
                to={to}
                role="menuitem"
                onClick={() => setOpen(false)}
                className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-ink-700 hover:bg-ink-50"
              >
                <Icon className="h-4 w-4 text-ink-400" aria-hidden="true" />
                {label}
              </Link>
            ))}

            {isStaff && (
              <Link
                to="/admin"
                role="menuitem"
                onClick={() => setOpen(false)}
                className="flex items-center gap-2.5 border-t border-ink-100 px-4 py-2.5 text-sm
                           font-medium text-brand-700 hover:bg-brand-50"
              >
                <LayoutDashboard className="h-4 w-4" aria-hidden="true" />
                Admin dashboard
              </Link>
            )}

            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                void dispatch(logout()).then(() => navigate('/'));
              }}
              className="flex w-full items-center gap-2.5 border-t border-ink-100 px-4 py-2.5
                         text-sm text-danger-600 hover:bg-danger-50"
            >
              <LogOut className="h-4 w-4" aria-hidden="true" />
              Sign out
            </button>
          </nav>
        </div>
      )}
    </div>
  );
}

function SearchBar({ className }: { className?: string }) {
  const navigate = useNavigate();
  const [term, setTerm] = useState('');

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const query = term.trim();
    if (query) navigate(`/search?q=${encodeURIComponent(query)}`);
  }

  return (
    <form role="search" onSubmit={handleSubmit} className={cn('relative', className)}>
      <label htmlFor="site-search" className="sr-only">
        Search products
      </label>
      <Search
        className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400"
        aria-hidden="true"
      />
      <input
        id="site-search"
        type="search"
        value={term}
        onChange={(event) => setTerm(event.target.value)}
        placeholder="Search for products, brands and more"
        className="input-base h-11 pl-10"
      />
    </form>
  );
}

export function Header() {
  const dispatch = useAppDispatch();
  const cartQuantity = useAppSelector((state) => state.cart.totalQuantity);
  const wishlistCount = useAppSelector((state) => state.wishlist.count);
  const mobileNavOpen = useAppSelector((state) => state.ui.mobileNavOpen);

  const { data: categories } = useCategories();
  const topCategories = (categories ?? []).filter((category) => !category.parentId).slice(0, 6);

  return (
    <header className="sticky top-0 z-40 border-b border-ink-200 bg-surface/95 backdrop-blur supports-[backdrop-filter]:bg-surface/80">
      <div className="container-page">
        <div className="flex h-16 items-center gap-4">
          <button
            type="button"
            onClick={() => dispatch(setMobileNavOpen(!mobileNavOpen))}
            aria-label={mobileNavOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={mobileNavOpen}
            className="-ml-2 rounded-lg p-2 text-ink-700 hover:bg-ink-100 lg:hidden"
          >
            {mobileNavOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>

          <Link to="/" className="flex shrink-0 items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600 text-white">
              <ShoppingBag className="h-4.5 w-4.5" aria-hidden="true" />
            </span>
            <span className="text-lg font-bold tracking-tight text-ink-900">ShopWave</span>
          </Link>

          <SearchBar className="hidden max-w-xl flex-1 md:block" />

          <div className="ml-auto flex items-center gap-1 sm:gap-2">
            <ThemeToggle className="hidden sm:flex" />

            <Link
              to="/wishlist"
              className="relative hidden rounded-lg p-2.5 text-ink-700 hover:bg-ink-100 sm:block"
              aria-label={`Wishlist, ${wishlistCount} items`}
            >
              <Heart className="h-5 w-5" aria-hidden="true" />
              <CountBadge count={wishlistCount} />
            </Link>

            <button
              type="button"
              onClick={() => dispatch(toggleCartDrawer())}
              className="relative rounded-lg p-2.5 text-ink-700 hover:bg-ink-100"
              aria-label={`Cart, ${cartQuantity} items`}
            >
              <ShoppingBag className="h-5 w-5" aria-hidden="true" />
              <CountBadge count={cartQuantity} />
            </button>

            <AccountMenu />
          </div>
        </div>

        <SearchBar className="pb-3 md:hidden" />

        <nav aria-label="Categories" className="hidden border-t border-ink-100 lg:block">
          <ul className="flex items-center gap-1 py-1">
            <li>
              <NavLink
                to="/products"
                className={({ isActive }) =>
                  cn(
                    'inline-block rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                    isActive ? 'text-brand-700' : 'text-ink-600 hover:bg-ink-50 hover:text-ink-900',
                  )
                }
              >
                All products
              </NavLink>
            </li>
            {topCategories.map((category) => (
              <li key={category.id}>
                <NavLink
                  to={`/category/${category.slug}`}
                  className={({ isActive }) =>
                    cn(
                      'inline-block rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                      isActive ? 'text-brand-700' : 'text-ink-600 hover:bg-ink-50 hover:text-ink-900',
                    )
                  }
                >
                  {category.name}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
      </div>

      {mobileNavOpen && (
        <nav aria-label="Mobile navigation" className="border-t border-ink-200 bg-surface lg:hidden">
          <ul className="container-page space-y-1 py-3">
            {[{ id: 'all', slug: 'products', name: 'All products' }].concat(
              topCategories.map((category) => ({
                id: category.id,
                slug: `category/${category.slug}`,
                name: category.name,
              })),
            ).map((item) => (
              <li key={item.id}>
                <Link
                  to={`/${item.slug}`}
                  onClick={() => dispatch(setMobileNavOpen(false))}
                  className="block rounded-lg px-3 py-2.5 text-sm font-medium text-ink-700 hover:bg-ink-50"
                >
                  {item.name}
                </Link>
              </li>
            ))}

            {/* The icon-only toggle is hidden below `sm`, so the mobile menu carries a labelled one. */}
            <li className="border-t border-ink-100 pt-1 sm:hidden">
              <ThemeToggle showLabel className="text-ink-700 hover:bg-ink-50" />
            </li>
          </ul>
        </nav>
      )}
    </header>
  );
}
