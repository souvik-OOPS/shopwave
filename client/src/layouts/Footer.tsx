import { Link } from 'react-router-dom';
import { ShieldCheck, ShoppingBag, Truck, Undo2 } from 'lucide-react';

const ASSURANCES = [
  { icon: Truck, title: 'Free delivery', description: 'On orders over ₹999' },
  { icon: Undo2, title: '7-day returns', description: 'On delivered orders' },
  { icon: ShieldCheck, title: 'Secure payments', description: 'Verified by Razorpay' },
];

const SECTIONS = [
  {
    title: 'Shop',
    links: [
      { label: 'All products', to: '/products' },
      { label: 'New arrivals', to: '/products?sort=newest' },
      { label: 'Best sellers', to: '/products?sort=popular' },
      { label: 'Offers', to: '/products?sort=price_asc' },
    ],
  },
  {
    title: 'Account',
    links: [
      { label: 'My orders', to: '/orders' },
      { label: 'Wishlist', to: '/wishlist' },
      { label: 'Addresses', to: '/addresses' },
      { label: 'Profile', to: '/profile' },
    ],
  },
  {
    title: 'Company',
    links: [
      { label: 'About us', to: '/about' },
      { label: 'Contact', to: '/contact' },
      { label: 'Careers', to: '/careers' },
      { label: 'Privacy', to: '/privacy' },
    ],
  },
];

export function Footer() {
  return (
    <footer className="mt-20 border-t border-ink-200 bg-ink-50">
      <div className="container-page">
        <ul className="grid gap-6 border-b border-ink-200 py-10 sm:grid-cols-3">
          {ASSURANCES.map(({ icon: Icon, title, description }) => (
            <li key={title} className="flex items-center gap-3">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-surface text-brand-600 shadow-sm">
                <Icon className="h-5 w-5" aria-hidden="true" />
              </span>
              <div>
                <p className="text-sm font-semibold text-ink-900">{title}</p>
                <p className="text-sm text-ink-500">{description}</p>
              </div>
            </li>
          ))}
        </ul>

        <div className="grid gap-10 py-12 md:grid-cols-4">
          <div>
            <Link to="/" className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600 text-white">
                <ShoppingBag className="h-4.5 w-4.5" aria-hidden="true" />
              </span>
              <span className="text-lg font-bold tracking-tight text-ink-900">ShopWave</span>
            </Link>
            <p className="mt-3 max-w-xs text-sm leading-relaxed text-ink-500">
              Considered electronics, fashion and home goods — chosen for how they hold up, not how
              loudly they sell.
            </p>
          </div>

          {SECTIONS.map((section) => (
            <nav key={section.title} aria-label={section.title}>
              <h2 className="text-sm font-semibold text-ink-900">{section.title}</h2>
              <ul className="mt-4 space-y-2.5">
                {section.links.map((link) => (
                  <li key={link.label}>
                    <Link to={link.to} className="text-sm text-ink-500 transition-colors hover:text-ink-900">
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>

        <div className="flex flex-col items-center justify-between gap-3 border-t border-ink-200 py-6 sm:flex-row">
          <p className="text-sm text-ink-500">
            © {new Date().getFullYear()} ShopWave. A portfolio commerce platform.
          </p>
          <p className="text-sm text-ink-500">Prices include GST · Shipping across India</p>
        </div>
      </div>
    </footer>
  );
}
