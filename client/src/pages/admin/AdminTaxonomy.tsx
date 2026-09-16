import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Pencil, Plus, Trash2 } from 'lucide-react';

import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { EmptyState, Spinner } from '@/components/ui/Feedback';
import { Checkbox, Input, Select, Textarea } from '@/components/ui/Input';
import { ConfirmDialog, Modal } from '@/components/ui/Modal';
import { brandApi, categoryApi } from '@/lib/api';
import { queryKeys } from '@/lib/queryClient';
import { useBrands, useCategories } from '@/hooks/useCatalog';
import { useToast } from '@/hooks/useToast';
import type { Brand, Category } from '@/types/api';

// ── Categories ──────────────────────────────────────────────────────────────

const categorySchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(80),
  description: z.string().trim().max(1000).optional(),
  imageUrl: z.string().url('Enter a valid URL').max(500).optional().or(z.literal('')),
  parentId: z.string().optional(),
  isActive: z.boolean(),
  sortOrder: z.coerce.number().int().min(0).max(9999),
});

export function AdminCategories() {
  const toast = useToast();
  const client = useQueryClient();
  const { data: categories, isLoading } = useCategories({ includeInactive: true });

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Category | null>(null);
  const [deleting, setDeleting] = useState<Category | null>(null);

  const form = useForm<z.infer<typeof categorySchema>>({
    resolver: zodResolver(categorySchema),
    defaultValues: { isActive: true, sortOrder: 0 },
  });

  const invalidate = () => client.invalidateQueries({ queryKey: queryKeys.categories.all });

  const save = useMutation({
    mutationFn: (values: z.infer<typeof categorySchema>) => {
      const payload = {
        name: values.name,
        isActive: values.isActive,
        sortOrder: values.sortOrder,
        ...(values.description ? { description: values.description } : {}),
        ...(values.imageUrl ? { imageUrl: values.imageUrl } : {}),
        ...(values.parentId ? { parentId: values.parentId } : {}),
      };

      return editing ? categoryApi.update(editing.id, payload) : categoryApi.create(payload);
    },
    onSuccess: () => {
      toast.success(editing ? 'Category updated' : 'Category created');
      setFormOpen(false);
      setEditing(null);
      form.reset({ isActive: true, sortOrder: 0, name: '' });
      void invalidate();
    },
    onError: (error) => toast.error(error),
  });

  const remove = useMutation({
    mutationFn: (id: string) => categoryApi.remove(id),
    onSuccess: () => {
      toast.success('Category deleted');
      setDeleting(null);
      void invalidate();
    },
    // Deleting a category with products returns 409 with the count, which lands here.
    onError: (error) => toast.error(error),
  });

  function openForm(category?: Category) {
    setEditing(category ?? null);
    form.reset(
      category
        ? {
            name: category.name,
            description: category.description ?? '',
            imageUrl: category.imageUrl ?? '',
            parentId: category.parentId ?? '',
            isActive: category.isActive,
            sortOrder: category.sortOrder,
          }
        : { name: '', description: '', imageUrl: '', parentId: '', isActive: true, sortOrder: 0 },
    );
    setFormOpen(true);
  }

  return (
    <div className="p-6 lg:p-8">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-heading-lg text-ink-900">Categories</h1>
          <p className="mt-1 text-sm text-ink-500">{categories?.length ?? 0} categories</p>
        </div>
        <Button onClick={() => openForm()} leftIcon={<Plus className="h-4 w-4" aria-hidden="true" />}>
          New category
        </Button>
      </header>

      {isLoading ? (
        <div className="flex justify-center py-16">
          <Spinner className="h-8 w-8" />
        </div>
      ) : !categories || categories.length === 0 ? (
        <EmptyState title="No categories yet" action={<Button onClick={() => openForm()}>Create one</Button>} />
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {categories.map((category) => (
            <li key={category.id} className="rounded-2xl border border-ink-200 bg-surface p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate font-semibold text-ink-900">{category.name}</p>
                  <p className="text-xs text-ink-500">/{category.slug}</p>
                </div>
                <Badge tone={category.isActive ? 'success' : 'neutral'}>
                  {category.isActive ? 'Active' : 'Hidden'}
                </Badge>
              </div>

              {category.description && (
                <p className="mt-2 line-clamp-2 text-sm text-ink-600">{category.description}</p>
              )}

              <p className="mt-3 text-sm text-ink-500">{category.productCount} products</p>

              <div className="mt-4 flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => openForm(category)}
                  leftIcon={<Pencil className="h-3.5 w-3.5" aria-hidden="true" />}
                >
                  Edit
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="ml-auto text-danger-600 hover:bg-danger-50"
                  aria-label={`Delete ${category.name}`}
                  onClick={() => setDeleting(category)}
                >
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title={editing ? 'Edit category' : 'New category'}
        footer={
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={() => setFormOpen(false)}>
              Cancel
            </Button>
            <Button
              loading={save.isPending}
              onClick={form.handleSubmit((values) => save.mutate(values))}
            >
              {editing ? 'Save changes' : 'Create'}
            </Button>
          </div>
        }
      >
        <form className="space-y-4" onSubmit={form.handleSubmit((values) => save.mutate(values))}>
          <Input label="Name" error={form.formState.errors.name?.message} {...form.register('name')} />
          <Textarea
            label="Description"
            rows={3}
            error={form.formState.errors.description?.message}
            {...form.register('description')}
          />
          <Input
            label="Image URL"
            error={form.formState.errors.imageUrl?.message}
            {...form.register('imageUrl')}
          />
          <Select
            label="Parent category"
            placeholder="Top level"
            options={(categories ?? [])
              .filter((candidate) => candidate.id !== editing?.id)
              .map((candidate) => ({ value: candidate.id, label: candidate.name }))}
            {...form.register('parentId')}
          />
          <Input
            label="Sort order"
            type="number"
            min="0"
            error={form.formState.errors.sortOrder?.message}
            {...form.register('sortOrder')}
          />
          <Checkbox label="Visible on the storefront" {...form.register('isActive')} />
        </form>
      </Modal>

      <ConfirmDialog
        open={Boolean(deleting)}
        title="Delete this category?"
        description={`"${deleting?.name ?? ''}" will be removed. Categories that still contain products or sub-categories cannot be deleted.`}
        confirmLabel="Delete"
        variant="danger"
        loading={remove.isPending}
        onConfirm={() => deleting && remove.mutate(deleting.id)}
        onCancel={() => setDeleting(null)}
      />
    </div>
  );
}

// ── Brands ──────────────────────────────────────────────────────────────────

const brandSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(80),
  description: z.string().trim().max(1000).optional(),
  logoUrl: z.string().url('Enter a valid URL').max(500).optional().or(z.literal('')),
  website: z.string().url('Enter a valid URL').max(500).optional().or(z.literal('')),
  isActive: z.boolean(),
});

export function AdminBrands() {
  const toast = useToast();
  const client = useQueryClient();
  const { data: brands, isLoading } = useBrands({ includeInactive: true });

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Brand | null>(null);
  const [deleting, setDeleting] = useState<Brand | null>(null);

  const form = useForm<z.infer<typeof brandSchema>>({
    resolver: zodResolver(brandSchema),
    defaultValues: { isActive: true },
  });

  const invalidate = () => client.invalidateQueries({ queryKey: queryKeys.brands.all });

  const save = useMutation({
    mutationFn: (values: z.infer<typeof brandSchema>) => {
      const payload = {
        name: values.name,
        isActive: values.isActive,
        ...(values.description ? { description: values.description } : {}),
        ...(values.logoUrl ? { logoUrl: values.logoUrl } : {}),
        ...(values.website ? { website: values.website } : {}),
      };
      return editing ? brandApi.update(editing.id, payload) : brandApi.create(payload);
    },
    onSuccess: () => {
      toast.success(editing ? 'Brand updated' : 'Brand created');
      setFormOpen(false);
      setEditing(null);
      void invalidate();
    },
    onError: (error) => toast.error(error),
  });

  const remove = useMutation({
    mutationFn: (id: string) => brandApi.remove(id),
    onSuccess: () => {
      toast.success('Brand deleted');
      setDeleting(null);
      void invalidate();
    },
    onError: (error) => toast.error(error),
  });

  function openForm(brand?: Brand) {
    setEditing(brand ?? null);
    form.reset(
      brand
        ? {
            name: brand.name,
            description: brand.description ?? '',
            logoUrl: brand.logoUrl ?? '',
            website: brand.website ?? '',
            isActive: brand.isActive,
          }
        : { name: '', description: '', logoUrl: '', website: '', isActive: true },
    );
    setFormOpen(true);
  }

  return (
    <div className="p-6 lg:p-8">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-heading-lg text-ink-900">Brands</h1>
          <p className="mt-1 text-sm text-ink-500">{brands?.length ?? 0} brands</p>
        </div>
        <Button onClick={() => openForm()} leftIcon={<Plus className="h-4 w-4" aria-hidden="true" />}>
          New brand
        </Button>
      </header>

      {isLoading ? (
        <div className="flex justify-center py-16">
          <Spinner className="h-8 w-8" />
        </div>
      ) : !brands || brands.length === 0 ? (
        <EmptyState title="No brands yet" action={<Button onClick={() => openForm()}>Create one</Button>} />
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {brands.map((brand) => (
            <li key={brand.id} className="rounded-2xl border border-ink-200 bg-surface p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate font-semibold text-ink-900">{brand.name}</p>
                  <p className="text-xs text-ink-500">/{brand.slug}</p>
                </div>
                <Badge tone={brand.isActive ? 'success' : 'neutral'}>
                  {brand.isActive ? 'Active' : 'Hidden'}
                </Badge>
              </div>

              {brand.description && (
                <p className="mt-2 line-clamp-2 text-sm text-ink-600">{brand.description}</p>
              )}

              <p className="mt-3 text-sm text-ink-500">{brand.productCount} products</p>

              <div className="mt-4 flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => openForm(brand)}
                  leftIcon={<Pencil className="h-3.5 w-3.5" aria-hidden="true" />}
                >
                  Edit
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="ml-auto text-danger-600 hover:bg-danger-50"
                  aria-label={`Delete ${brand.name}`}
                  onClick={() => setDeleting(brand)}
                >
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title={editing ? 'Edit brand' : 'New brand'}
        footer={
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={() => setFormOpen(false)}>
              Cancel
            </Button>
            <Button loading={save.isPending} onClick={form.handleSubmit((values) => save.mutate(values))}>
              {editing ? 'Save changes' : 'Create'}
            </Button>
          </div>
        }
      >
        <form className="space-y-4" onSubmit={form.handleSubmit((values) => save.mutate(values))}>
          <Input label="Name" error={form.formState.errors.name?.message} {...form.register('name')} />
          <Textarea label="Description" rows={3} {...form.register('description')} />
          <Input
            label="Logo URL"
            error={form.formState.errors.logoUrl?.message}
            {...form.register('logoUrl')}
          />
          <Input
            label="Website"
            error={form.formState.errors.website?.message}
            {...form.register('website')}
          />
          <Checkbox label="Visible on the storefront" {...form.register('isActive')} />
        </form>
      </Modal>

      <ConfirmDialog
        open={Boolean(deleting)}
        title="Delete this brand?"
        description={`"${deleting?.name ?? ''}" will be removed. Brands still linked to products cannot be deleted.`}
        confirmLabel="Delete"
        variant="danger"
        loading={remove.isPending}
        onConfirm={() => deleting && remove.mutate(deleting.id)}
        onCancel={() => setDeleting(null)}
      />
    </div>
  );
}
