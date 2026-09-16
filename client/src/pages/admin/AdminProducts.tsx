import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useFieldArray, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { ArrowLeft, Pencil, Plus, Search, Trash2 } from 'lucide-react';

import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { EmptyState, ErrorState, Spinner, TableSkeleton } from '@/components/ui/Feedback';
import { Image } from '@/components/ui/Image';
import { Checkbox, Input, Select, Textarea } from '@/components/ui/Input';
import { ConfirmDialog } from '@/components/ui/Modal';
import { Pagination } from '@/components/ui/Pagination';
import { productApi } from '@/lib/api';
import { queryKeys } from '@/lib/queryClient';
import { useBrands, useCategories, useDebouncedValue } from '@/hooks/useCatalog';
import { useToast } from '@/hooks/useToast';
import { ApiRequestError } from '@/lib/apiClient';
import { formatCurrency } from '@/lib/utils';
import type { Product } from '@/types/api';

const STATUS_OPTIONS = [
  { value: '', label: 'All statuses' },
  { value: 'ACTIVE', label: 'Active' },
  { value: 'DRAFT', label: 'Draft' },
  { value: 'ARCHIVED', label: 'Archived' },
];

export function AdminProducts() {
  const toast = useToast();
  const client = useQueryClient();

  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [deleting, setDeleting] = useState<{ id: string; name: string } | null>(null);

  const debouncedSearch = useDebouncedValue(search, 400);
  const params = {
    page,
    limit: 20,
    ...(debouncedSearch ? { q: debouncedSearch } : {}),
    ...(status ? { status } : {}),
  };

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: queryKeys.products.adminList(params),
    queryFn: () => productApi.adminList(params),
  });

  const removeProduct = useMutation({
    mutationFn: (id: string) => productApi.remove(id),
    onSuccess: () => {
      // Soft delete on the server — order history and reviews keep resolving.
      toast.success('Product archived', 'Existing orders and reviews are unaffected.');
      setDeleting(null);
      void client.invalidateQueries({ queryKey: queryKeys.products.all });
    },
    onError: (error) => toast.error(error),
  });

  return (
    <div className="p-6 lg:p-8">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-heading-lg text-ink-900">Products</h1>
          <p className="mt-1 text-sm text-ink-500">
            {data?.meta ? `${data.meta.total} products` : 'Loading…'}
          </p>
        </div>
        <Link to="/admin/products/create">
          <Button leftIcon={<Plus className="h-4 w-4" aria-hidden="true" />}>New product</Button>
        </Link>
      </header>

      <div className="mb-5 flex flex-wrap gap-3">
        <Input
          aria-label="Search products"
          placeholder="Search by name, SKU or description"
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
            setPage(1);
          }}
          leftIcon={<Search className="h-4 w-4" aria-hidden="true" />}
          containerClassName="flex-1 min-w-64"
        />
        <div className="w-full sm:w-48">
          <Select
            aria-label="Filter by status"
            options={STATUS_OPTIONS}
            value={status}
            onChange={(event) => {
              setStatus(event.target.value);
              setPage(1);
            }}
          />
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-ink-200 bg-surface">
        {isLoading ? (
          <div className="p-5">
            <TableSkeleton rows={6} columns={5} />
          </div>
        ) : isError ? (
          <ErrorState onRetry={() => void refetch()} />
        ) : !data || data.products.length === 0 ? (
          <EmptyState
            title="No products found"
            description="Create your first product to start selling."
            action={
              <Link to="/admin/products/create">
                <Button>New product</Button>
              </Link>
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[52rem] text-sm">
              <thead className="border-b border-ink-200 bg-ink-50 text-left">
                <tr>
                  <th scope="col" className="px-5 py-3 font-semibold text-ink-600">Product</th>
                  <th scope="col" className="px-5 py-3 font-semibold text-ink-600">Category</th>
                  <th scope="col" className="px-5 py-3 font-semibold text-ink-600">Price</th>
                  <th scope="col" className="px-5 py-3 font-semibold text-ink-600">Stock</th>
                  <th scope="col" className="px-5 py-3 font-semibold text-ink-600">Status</th>
                  <th scope="col" className="px-5 py-3 text-right font-semibold text-ink-600">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100">
                {data.products.map((product) => (
                  <tr key={product.id} className="transition-colors hover:bg-ink-50">
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-3">
                        <Image
                          src={product.images[0]?.url}
                          alt=""
                          aspect="square"
                          containerClassName="h-11 w-11 shrink-0 rounded-lg"
                        />
                        <div className="min-w-0">
                          <p className="truncate font-medium text-ink-900">{product.name}</p>
                          <p className="text-xs text-ink-500">{product.sku}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-3 text-ink-600">{product.category?.name ?? '—'}</td>
                    <td className="px-5 py-3">
                      <p className="font-medium text-ink-900">{formatCurrency(product.effectivePrice)}</p>
                      {product.isDiscounted && (
                        <p className="text-xs text-ink-400 line-through">{formatCurrency(product.price)}</p>
                      )}
                    </td>
                    <td className="px-5 py-3">
                      <span
                        className={
                          product.stockQuantity === 0
                            ? 'font-medium text-danger-600'
                            : product.isLowStock
                              ? 'font-medium text-warning-700'
                              : 'text-ink-600'
                        }
                      >
                        {product.stockQuantity}
                      </span>
                    </td>
                    <td className="px-5 py-3">
                      <Badge
                        tone={
                          product.status === 'ACTIVE'
                            ? 'success'
                            : product.status === 'DRAFT'
                              ? 'warning'
                              : 'neutral'
                        }
                      >
                        {product.status}
                      </Badge>
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex justify-end gap-1">
                        <Link to={`/admin/products/${product.id}`}>
                          <Button size="icon" variant="ghost" aria-label={`Edit ${product.name}`}>
                            <Pencil className="h-4 w-4" aria-hidden="true" />
                          </Button>
                        </Link>
                        <Button
                          size="icon"
                          variant="ghost"
                          aria-label={`Archive ${product.name}`}
                          className="text-danger-600 hover:bg-danger-50"
                          onClick={() => setDeleting({ id: product.id, name: product.name })}
                        >
                          <Trash2 className="h-4 w-4" aria-hidden="true" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {data?.meta && <Pagination meta={data.meta} onPageChange={setPage} className="mt-6" />}

      <ConfirmDialog
        open={Boolean(deleting)}
        title="Archive this product?"
        description={`"${deleting?.name ?? ''}" will be removed from the storefront. It is soft-deleted, so past orders and reviews stay intact.`}
        confirmLabel="Archive product"
        variant="danger"
        loading={removeProduct.isPending}
        onConfirm={() => deleting && removeProduct.mutate(deleting.id)}
        onCancel={() => setDeleting(null)}
      />
    </div>
  );
}

/**
 * Stock editing, kept out of the product form on purpose.
 *
 * The product form saves an absolute snapshot of what was on screen when it loaded.
 * Stock is the one field that moves on its own — every checkout changes it — so it goes
 * through the inventory endpoint instead: "adjust by" sends a delta the database applies
 * atomically, which is the only safe way to restock something being bought concurrently.
 * "Set to" is there for a physical stock count, where an absolute number is the intent.
 */
function InventoryPanel({ productId, product }: { productId: string; product?: Product }) {
  const toast = useToast();
  const client = useQueryClient();

  // Empty string targets the product's own inventory row; otherwise a variant's.
  const [variantId, setVariantId] = useState('');
  const [quantity, setQuantity] = useState('');
  const [delta, setDelta] = useState('');

  const variants = product?.variants ?? [];
  const target = variantId ? variants.find((variant) => variant.id === variantId) : product;
  const stock = target?.stockQuantity ?? 0;

  const update = useMutation({
    mutationFn: (payload: { quantity?: number; delta?: number }) =>
      productApi.updateInventory(productId, { ...payload, ...(variantId ? { variantId } : {}) }),
    onSuccess: () => {
      setQuantity('');
      setDelta('');
      toast.success('Stock updated');
      void client.invalidateQueries({ queryKey: queryKeys.products.all });
    },
    onError: (error) => toast.error(error),
  });

  return (
    <section className="rounded-2xl border border-ink-200 bg-surface p-5">
      <h2 className="text-base font-semibold text-ink-900">Inventory</h2>
      <p className="mt-2 text-sm text-ink-500">
        Current stock: <span className="font-semibold text-ink-900">{stock}</span>
      </p>

      <div className="mt-4 space-y-4">
        {variants.length > 0 && (
          <Select
            label="Stock for"
            options={[
              { value: '', label: `${product?.name ?? 'Product'} (no option)` },
              ...variants.map((variant) => ({ value: variant.id, label: variant.name })),
            ]}
            value={variantId}
            onChange={(event) => {
              setVariantId(event.target.value);
              setQuantity('');
              setDelta('');
            }}
          />
        )}
        <div className="flex items-end gap-2">
          <Input
            name="quantity"
            label="Set stock to"
            type="number"
            min="0"
            placeholder={String(stock)}
            containerClassName="flex-1"
            value={quantity}
            onChange={(event) => setQuantity(event.target.value)}
          />
          <Button
            type="button"
            variant="outline"
            loading={update.isPending}
            disabled={quantity.trim() === '' || Number.isNaN(Number(quantity))}
            onClick={() => update.mutate({ quantity: Number(quantity) })}
          >
            Set
          </Button>
        </div>

        <div className="flex items-end gap-2">
          <Input
            name="delta"
            label="Adjust by"
            type="number"
            placeholder="e.g. 25 or -3"
            hint="Applied as a relative change, safe under concurrent checkouts"
            containerClassName="flex-1"
            value={delta}
            onChange={(event) => setDelta(event.target.value)}
          />
          <Button
            type="button"
            variant="outline"
            loading={update.isPending}
            disabled={delta.trim() === '' || Number(delta) === 0 || Number.isNaN(Number(delta))}
            onClick={() => update.mutate({ delta: Number(delta) })}
          >
            Apply
          </Button>
        </div>
      </div>
    </section>
  );
}

// ── Create / edit form ──────────────────────────────────────────────────────

/** Same blank-is-not-zero normalisation the coupon form needs; see AdminCoupons. */
function optionalNumber<T extends z.ZodTypeAny>(schema: T) {
  return z.preprocess(
    (value) => (value === '' || value === null || value === undefined ? undefined : value),
    schema.optional(),
  ) as unknown as z.ZodType<z.output<T> | undefined, z.ZodTypeDef, unknown>;
}

const productFormSchema = z
  .object({
    name: z.string().trim().min(1, 'Name is required').max(200),
    description: z.string().trim().min(1, 'Description is required').max(10_000),
    shortDescription: z.string().trim().max(300).optional(),
    price: z.coerce.number().positive('Price must be greater than zero'),
    discountPrice: z.coerce.number().nonnegative().optional().or(z.literal(0)),
    categoryId: z.string().min(1, 'Choose a category'),
    brandId: z.string().optional(),
    sku: z.string().trim().max(60).optional(),
    status: z.enum(['DRAFT', 'ACTIVE', 'ARCHIVED']),
    isFeatured: z.boolean(),
    stock: z.coerce.number().int().min(0),
    lowStockThreshold: z.coerce.number().int().min(0),
    tags: z.string().optional(),
    imageUrls: z.string().optional(),
    variants: z
      .array(
        z.object({
          id: z.string().optional(),
          name: z.string().trim().min(1, 'Option name is required').max(80),
          sku: z.string().trim().max(60).optional(),
          price: optionalNumber(z.coerce.number().positive('Must be greater than zero')),
          stock: z.coerce.number().int('Whole numbers only').min(0),
          isActive: z.boolean(),
        }),
      )
      .max(50)
      .default([]),
  })
  .refine((data) => !data.discountPrice || data.discountPrice < data.price, {
    message: 'Discount price must be lower than the regular price',
    path: ['discountPrice'],
  });

type ProductFormValues = z.infer<typeof productFormSchema>;

export function AdminProductForm() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const toast = useToast();
  const client = useQueryClient();

  const isEdit = Boolean(id);

  const { data: existing, isLoading: loadingProduct } = useQuery({
    queryKey: queryKeys.products.adminDetail(id ?? ''),
    queryFn: async () => {
      const { product } = await productApi.adminDetail(id as string);
      return product;
    },
    enabled: isEdit,
  });

  const { data: categories } = useCategories({ includeInactive: true });
  const { data: brands } = useBrands({ includeInactive: true });

  const {
    control,
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<ProductFormValues>({
    resolver: zodResolver(productFormSchema),
    values: existing
      ? {
          name: existing.name,
          description: existing.description,
          shortDescription: existing.shortDescription ?? '',
          price: existing.price,
          discountPrice: existing.discountPrice ?? 0,
          categoryId: existing.category?.id ?? '',
          brandId: existing.brand?.id ?? '',
          sku: existing.sku,
          status: existing.status,
          isFeatured: existing.isFeatured,
          stock: existing.stockQuantity,
          lowStockThreshold: 5,
          tags: existing.tags.join(', '),
          imageUrls: existing.images.map((image) => image.url).join('\n'),
          variants: existing.variants.map((variant) => ({
            id: variant.id,
            name: variant.name,
            sku: variant.sku,
            // The API reports the price this option sells at, inherited or not; only a
            // genuine override belongs in a field whose hint says blank means inherit.
            price: variant.hasPriceOverride ? variant.price : undefined,
            stock: variant.stockQuantity,
            isActive: variant.isActive,
          })),
        }
      : undefined,
    defaultValues: {
      status: 'DRAFT',
      isFeatured: false,
      stock: 0,
      lowStockThreshold: 5,
      price: 0,
      variants: [],
    },
  });

  // Variants are a list edited in place, so they need field-array handling rather than
  // one `register` per name.
  //
  // `keyName: 'rowKey'` matters: the field array stamps each row with a generated React
  // key under this name, and its default is `id` — which would silently shadow the
  // persisted variant id this form carries. Every row then looks like it has an id, so
  // "is this row new?" is always false and any lookup by id misses.
  const variantFields = useFieldArray({ control, name: 'variants', keyName: 'rowKey' });

  /**
   * How a blank price override is sent.
   *
   * On edit it has to be an explicit `null`: an omitted field means "leave unchanged",
   * so staying silent would keep an override the admin just cleared — while the field's
   * own hint promises that blank inherits the product price. A product being created has
   * no override to clear, and its schema does not accept null, so the key is omitted.
   */
  const variantPriceField = (price: number | undefined) => {
    if (isEdit) return { price: price ?? null };
    return price === undefined ? {} : { price };
  };

  const mutation = useMutation({
    mutationFn: (values: ProductFormValues) => {
      const images = (values.imageUrls ?? '')
        .split('\n')
        .map((url) => url.trim())
        .filter(Boolean)
        .map((url, index) => ({ url, position: index, isPrimary: index === 0 }));

      const tags = (values.tags ?? '')
        .split(',')
        .map((tag) => tag.trim())
        .filter(Boolean);

      // Variants are upserted by the API: a row with an id is updated, one without is
      // created along with its own inventory row. Omitting the key entirely leaves the
      // existing options untouched, which is what an unchanged form should do.
      const variants = values.variants.map((variant, index) => ({
        ...(variant.id ? { id: variant.id } : {}),
        name: variant.name,
        ...(variant.sku ? { sku: variant.sku } : {}),
        ...variantPriceField(variant.price),
        // Attributes are not editable on this form, so the ones the option already has
        // are sent back unchanged. Sending `{}` — which is what this used to do — erased
        // them on every unrelated product edit.
        attributes: existing?.variants.find((row) => row.id === variant.id)?.attributes ?? {},
        position: index,
        isActive: variant.isActive,
        stock: variant.stock,
      }));

      const base = {
        name: values.name,
        description: values.description,
        price: values.price,
        categoryId: values.categoryId,
        status: values.status,
        isFeatured: values.isFeatured,
        tags,
        images,
        ...(variants.length > 0 ? { variants } : {}),
        ...(values.sku ? { sku: values.sku } : {}),
      };

      if (!isEdit) {
        return productApi.create({
          ...base,
          // On create, an empty optional field is simply not sent.
          ...(values.shortDescription ? { shortDescription: values.shortDescription } : {}),
          ...(values.discountPrice ? { discountPrice: values.discountPrice } : {}),
          ...(values.brandId ? { brandId: values.brandId } : {}),
          stock: values.stock,
          lowStockThreshold: values.lowStockThreshold,
        });
      }

      // On edit, a cleared field has to be sent as `null`. Omitting it means "leave it
      // alone", so emptying the discount, the brand or the short description and saving
      // would report success and change nothing.
      // Stock is managed through the inventory endpoint, so it is only part of creation.
      return productApi.update(id as string, {
        ...base,
        shortDescription: values.shortDescription?.trim() ? values.shortDescription : null,
        discountPrice: values.discountPrice ? values.discountPrice : null,
        brandId: values.brandId ? values.brandId : null,
      });
    },

    onSuccess: () => {
      toast.success(isEdit ? 'Product updated' : 'Product created');
      void client.invalidateQueries({ queryKey: queryKeys.products.all });
      navigate('/admin/products');
    },

    onError: (error) => {
      if (error instanceof ApiRequestError && error.fieldErrors.length > 0) {
        for (const fieldError of error.fieldErrors) {
          setError(fieldError.path as keyof ProductFormValues, { message: fieldError.message });
        }
      }
      toast.error(error);
    },
  });

  if (isEdit && loadingProduct) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Spinner className="h-8 w-8" />
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-8">
      <Link
        to="/admin/products"
        className="mb-6 inline-flex items-center gap-1.5 text-sm font-medium text-ink-600 hover:text-ink-900"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Back to products
      </Link>

      <h1 className="text-heading-lg text-ink-900">{isEdit ? 'Edit product' : 'New product'}</h1>

      <form
        onSubmit={handleSubmit((values) => mutation.mutate(values))}
        className="mt-6 grid gap-6 lg:grid-cols-[1fr_20rem]"
        noValidate
      >
        <div className="space-y-6">
          <section className="rounded-2xl border border-ink-200 bg-surface p-5">
            <h2 className="text-base font-semibold text-ink-900">Basics</h2>
            <div className="mt-4 space-y-4">
              <Input label="Product name" error={errors.name?.message} {...register('name')} />
              <Input
                label="Short description"
                hint="Shown on product cards"
                error={errors.shortDescription?.message}
                {...register('shortDescription')}
              />
              <Textarea
                label="Full description"
                rows={7}
                error={errors.description?.message}
                {...register('description')}
              />
              <Input
                label="SKU"
                hint="Leave blank to generate one automatically"
                error={errors.sku?.message}
                {...register('sku')}
              />
            </div>
          </section>

          <section className="rounded-2xl border border-ink-200 bg-surface p-5">
            <h2 className="text-base font-semibold text-ink-900">Pricing</h2>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <Input
                label="Price (₹)"
                type="number"
                step="0.01"
                min="0"
                error={errors.price?.message}
                {...register('price')}
              />
              <Input
                label="Discount price (₹)"
                type="number"
                step="0.01"
                min="0"
                hint="Optional — must be lower than the price"
                error={errors.discountPrice?.message}
                {...register('discountPrice')}
              />
            </div>
          </section>

          <section className="rounded-2xl border border-ink-200 bg-surface p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold text-ink-900">Options</h2>
                <p className="mt-1 text-sm text-ink-500">
                  Sizes, colours or finishes. Each option carries its own stock, so a product
                  with options is sold from these rows rather than from the product&apos;s own.
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                leftIcon={<Plus className="h-4 w-4" aria-hidden="true" />}
                onClick={() =>
                  variantFields.append({ name: '', sku: '', price: undefined, stock: 0, isActive: true })
                }
              >
                Add option
              </Button>
            </div>

            {variantFields.fields.length > 0 && (
              <ul className="mt-4 space-y-4">
                {variantFields.fields.map((field, index) => (
                  <li key={field.rowKey} className="rounded-xl border border-ink-200 p-4">
                    <div className="grid gap-3 sm:grid-cols-2">
                      <Input
                        label="Option name"
                        placeholder="e.g. Ivory"
                        error={errors.variants?.[index]?.name?.message}
                        {...register(`variants.${index}.name`)}
                      />
                      <Input
                        label="SKU"
                        hint="Generated from the product SKU when blank"
                        error={errors.variants?.[index]?.sku?.message}
                        {...register(`variants.${index}.sku`)}
                      />
                      <Input
                        label="Price override (₹)"
                        type="number"
                        min="0"
                        hint="Blank inherits the product price"
                        error={errors.variants?.[index]?.price?.message}
                        {...register(`variants.${index}.price`)}
                      />
                      {field.id ? (
                        <div className="text-sm">
                          <p className="font-medium text-ink-700">Stock</p>
                          <p className="mt-2 text-ink-900">
                            {existing?.variants.find((variant) => variant.id === field.id)
                              ?.stockQuantity ?? 0}{' '}
                            in stock
                          </p>
                          <p className="mt-1 text-xs text-ink-500">
                            Adjusted under Inventory, so a restock cannot overwrite a sale.
                          </p>
                        </div>
                      ) : (
                        <Input
                          label="Initial stock"
                          type="number"
                          min="0"
                          error={errors.variants?.[index]?.stock?.message}
                          {...register(`variants.${index}.stock`)}
                        />
                      )}
                    </div>

                    <div className="mt-3 flex items-center justify-between gap-3">
                      <Checkbox label="Available to buy" {...register(`variants.${index}.isActive`)} />
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        leftIcon={<Trash2 className="h-4 w-4" aria-hidden="true" />}
                        onClick={() => variantFields.remove(index)}
                      >
                        Remove
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}

            {isEdit && variantFields.fields.length > 0 && (
              <p className="mt-4 text-xs leading-relaxed text-ink-500">
                Removing a row here stops it being sent on save; existing options are never
                deleted, because past orders and their inventory rows still reference them.
                Untick &ldquo;Available to buy&rdquo; to retire one.
              </p>
            )}
          </section>

          <section className="rounded-2xl border border-ink-200 bg-surface p-5">
            <h2 className="text-base font-semibold text-ink-900">Images</h2>
            <Textarea
              label="Image URLs"
              rows={4}
              hint="One URL per line. The first becomes the primary image."
              className="mt-4"
              error={errors.imageUrls?.message}
              {...register('imageUrls')}
            />
          </section>
        </div>

        <aside className="space-y-6">
          <section className="rounded-2xl border border-ink-200 bg-surface p-5">
            <h2 className="text-base font-semibold text-ink-900">Organisation</h2>
            <div className="mt-4 space-y-4">
              <Select
                label="Category"
                placeholder="Choose a category"
                options={(categories ?? []).map((category) => ({
                  value: category.id,
                  label: category.name,
                }))}
                error={errors.categoryId?.message}
                {...register('categoryId')}
              />
              <Select
                label="Brand"
                placeholder="No brand"
                options={(brands ?? []).map((brand) => ({ value: brand.id, label: brand.name }))}
                error={errors.brandId?.message}
                {...register('brandId')}
              />
              <Select
                label="Status"
                options={[
                  { value: 'DRAFT', label: 'Draft' },
                  { value: 'ACTIVE', label: 'Active' },
                  { value: 'ARCHIVED', label: 'Archived' },
                ]}
                error={errors.status?.message}
                {...register('status')}
              />
              <Input
                label="Tags"
                hint="Comma separated"
                error={errors.tags?.message}
                {...register('tags')}
              />
              <Checkbox label="Feature on the homepage" {...register('isFeatured')} />
            </div>
          </section>

          {!isEdit && (
            <section className="rounded-2xl border border-ink-200 bg-surface p-5">
              <h2 className="text-base font-semibold text-ink-900">Inventory</h2>
              <div className="mt-4 space-y-4">
                <Input
                  label="Initial stock"
                  type="number"
                  min="0"
                  error={errors.stock?.message}
                  {...register('stock')}
                />
                <Input
                  label="Low stock threshold"
                  type="number"
                  min="0"
                  hint="Triggers the dashboard alert"
                  error={errors.lowStockThreshold?.message}
                  {...register('lowStockThreshold')}
                />
              </div>
            </section>
          )}

          {isEdit && id && <InventoryPanel productId={id} product={existing} />}

          <Button type="submit" fullWidth size="lg" loading={mutation.isPending}>
            {isEdit ? 'Save changes' : 'Create product'}
          </Button>
        </aside>
      </form>
    </div>
  );
}
