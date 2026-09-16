import { Link } from 'react-router-dom';
import { ArrowRight, Sparkles, TrendingUp } from 'lucide-react';

import { ProductGridSkeleton } from '@/components/ui/Feedback';
import { Image } from '@/components/ui/Image';
import { ProductCard } from '@/components/product/ProductCard';
import { useCategories, useProducts } from '@/hooks/useCatalog';

function SectionHeader({
  eyebrow,
  title,
  description,
  href,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  href?: string;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        {eyebrow && (
          <p className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-brand-600">{eyebrow}</p>
        )}
        <h2 className="text-heading text-ink-900">{title}</h2>
        {description && <p className="mt-1 text-sm text-ink-500">{description}</p>}
      </div>
      {href && (
        <Link
          to={href}
          className="inline-flex items-center gap-1 text-sm font-semibold text-brand-700 hover:underline"
        >
          View all
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </Link>
      )}
    </div>
  );
}

export default function HomePage() {
  const featured = useProducts({ featured: true, limit: 8, sort: 'popular' });
  const newest = useProducts({ limit: 8, sort: 'newest' });
  const { data: categories, isLoading: categoriesLoading } = useCategories();

  const topCategories = (categories ?? []).filter((category) => !category.parentId).slice(0, 6);

  return (
    <div className="pb-8">
      {/* Hero */}
      {/* Literal slate/indigo, not the themed ramps: the hero is dark in both themes. */}
      <section className="relative overflow-hidden bg-slate-900">
        <div className="absolute inset-0 bg-gradient-to-br from-indigo-700 via-indigo-800 to-slate-950" />
        <div
          className="absolute -right-32 -top-32 h-[28rem] w-[28rem] rounded-full bg-indigo-400/20 blur-3xl"
          aria-hidden="true"
        />

        <div className="container-page relative py-20 sm:py-28">
          <div className="max-w-2xl">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-white/90 backdrop-blur">
              <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
              New season, fewer but better things
            </span>

            <h1 className="mt-5 text-display-lg text-white sm:text-[4rem]">
              Things worth
              <br />
              keeping.
            </h1>

            <p className="mt-5 max-w-lg text-lg leading-relaxed text-white/70">
              A tightly edited catalogue of electronics, apparel and home goods — picked for how they
              hold up, delivered free across India on orders over ₹999.
            </p>

            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                to="/products"
                className="inline-flex h-12 items-center rounded-xl bg-white px-7 text-base font-semibold
                           text-slate-900 shadow-sm transition-colors hover:bg-white/90
                           focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2
                           focus-visible:ring-offset-indigo-800"
              >
                Shop everything
              </Link>
              <Link
                to="/products?sort=popular"
                className="inline-flex h-12 items-center gap-2 rounded-xl border border-white/25 px-7
                           text-base font-semibold text-white transition-colors hover:bg-white/10"
              >
                <TrendingUp className="h-4 w-4" aria-hidden="true" />
                Best sellers
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Categories */}
      <section className="container-page py-14">
        <SectionHeader
          eyebrow="Browse"
          title="Shop by category"
          description="Start where you already know you're headed."
        />

        {categoriesLoading ? (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
            {Array.from({ length: 6 }, (_, index) => (
              <div key={index} className="skeleton aspect-[4/5] rounded-2xl" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
            {topCategories.map((category) => (
              <Link
                key={category.id}
                to={`/category/${category.slug}`}
                className="group relative overflow-hidden rounded-2xl border border-ink-200 bg-surface transition-shadow hover:shadow-card-hover"
              >
                <Image
                  src={category.imageUrl ?? `https://picsum.photos/seed/${category.slug}/500/620`}
                  alt=""
                  aspect="portrait"
                  className="transition-transform duration-500 group-hover:scale-105"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-slate-950/80 via-slate-950/10 to-transparent" />
                <div className="absolute inset-x-0 bottom-0 p-4">
                  <p className="text-sm font-semibold text-white">{category.name}</p>
                  <p className="text-xs text-white/70">{category.productCount} items</p>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* Featured */}
      <section className="container-page py-8">
        <SectionHeader
          eyebrow="Hand-picked"
          title="Featured products"
          description="The ones we keep recommending."
          href="/products?featured=true"
        />

        {featured.isLoading ? (
          <ProductGridSkeleton count={8} />
        ) : featured.data && featured.data.products.length > 0 ? (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {featured.data.products.map((product, index) => (
              <ProductCard key={product.id} product={product} priority={index < 4} />
            ))}
          </div>
        ) : (
          <p className="py-8 text-center text-sm text-ink-500">
            No featured products yet. Run the database seed to populate the catalogue.
          </p>
        )}
      </section>

      {/* Promo strip */}
      <section className="container-page py-8">
        <div className="grid gap-4 sm:grid-cols-2">
          {[
            {
              title: 'Free delivery over ₹999',
              copy: 'Calculated on your discounted total, so coupons never cost you the perk.',
              tone: 'bg-brand-50 text-brand-900',
            },
            {
              title: '7-day returns',
              copy: 'Changed your mind? Start a return from your orders page within a week of delivery.',
              tone: 'bg-ink-100 text-ink-900',
            },
          ].map((promo) => (
            <div key={promo.title} className={`rounded-2xl p-8 ${promo.tone}`}>
              <h3 className="text-lg font-semibold">{promo.title}</h3>
              <p className="mt-1.5 max-w-sm text-sm opacity-80">{promo.copy}</p>
            </div>
          ))}
        </div>
      </section>

      {/* New arrivals */}
      <section className="container-page py-8">
        <SectionHeader
          eyebrow="Just landed"
          title="New arrivals"
          description="The most recent additions to the catalogue."
          href="/products?sort=newest"
        />

        {newest.isLoading ? (
          <ProductGridSkeleton count={8} />
        ) : (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {(newest.data?.products ?? []).map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
