import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ShoppingBag } from 'lucide-react';

interface AuthShellProps {
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
}

/**
 * Split layout shared by every auth screen: form on the left, brand panel on the right
 * (hidden on mobile, where it would just push the form below the fold).
 */
export function AuthShell({ title, subtitle, children, footer }: AuthShellProps) {
  return (
    <div className="grid min-h-[calc(100vh-4rem)] lg:grid-cols-2">
      <div className="flex items-center justify-center px-4 py-12 sm:px-8">
        <div className="w-full max-w-md">
          <Link to="/" className="mb-8 inline-flex items-center gap-2 lg:hidden">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600 text-white">
              <ShoppingBag className="h-4.5 w-4.5" aria-hidden="true" />
            </span>
            <span className="text-lg font-bold tracking-tight text-ink-900">ShopWave</span>
          </Link>

          <h1 className="text-heading-lg text-ink-900">{title}</h1>
          {subtitle && <p className="mt-2 text-sm leading-relaxed text-ink-500">{subtitle}</p>}

          <div className="mt-8">{children}</div>

          {footer && <div className="mt-8">{footer}</div>}
        </div>
      </div>

      {/* Literal slate/indigo: this panel stays dark in both themes. */}
      <aside className="relative hidden overflow-hidden bg-slate-900 lg:block" aria-hidden="true">
        <div className="absolute inset-0 bg-gradient-to-br from-indigo-700 via-indigo-800 to-slate-950" />
        <div className="absolute -left-24 top-1/4 h-96 w-96 rounded-full bg-indigo-500/20 blur-3xl" />
        <div className="absolute -right-16 bottom-1/4 h-80 w-80 rounded-full bg-indigo-400/20 blur-3xl" />

        <div className="relative flex h-full flex-col justify-between p-12 text-white">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/15 backdrop-blur">
              <ShoppingBag className="h-5 w-5" />
            </span>
            <span className="text-lg font-bold tracking-tight">ShopWave</span>
          </div>

          <div>
            <p className="max-w-md text-2xl font-semibold leading-snug tracking-tight">
              A storefront built the way a real one has to be — prices, stock and payments settled
              on the server, every time.
            </p>
            <dl className="mt-10 grid grid-cols-3 gap-6 border-t border-white/15 pt-8">
              {[
                ['10k+', 'Products'],
                ['50k+', 'Customers'],
                ['4.8', 'Avg. rating'],
              ].map(([value, label]) => (
                <div key={label}>
                  <dt className="text-2xl font-bold">{value}</dt>
                  <dd className="mt-0.5 text-sm text-white/60">{label}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      </aside>
    </div>
  );
}
