import { Link } from 'react-router-dom';
import { Home, Search } from 'lucide-react';

import { Button } from '@/components/ui/Button';

export default function NotFoundPage() {
  return (
    <div className="container-page flex min-h-[60vh] flex-col items-center justify-center py-16 text-center">
      <p className="text-sm font-semibold uppercase tracking-widest text-brand-600">404</p>
      <h1 className="mt-3 text-display text-ink-900">Page not found</h1>
      <p className="mt-3 max-w-md text-sm leading-relaxed text-ink-500">
        The page you were looking for does not exist, or it may have moved. Try searching for what you
        need, or head back to the homepage.
      </p>

      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <Link to="/">
          <Button leftIcon={<Home className="h-4 w-4" aria-hidden="true" />}>Back to home</Button>
        </Link>
        <Link to="/search">
          <Button variant="outline" leftIcon={<Search className="h-4 w-4" aria-hidden="true" />}>
            Search products
          </Button>
        </Link>
      </div>
    </div>
  );
}
