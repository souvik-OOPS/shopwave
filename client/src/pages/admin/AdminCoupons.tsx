import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Plus, Ticket, Trash2 } from 'lucide-react';

import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { EmptyState, Spinner, TableSkeleton } from '@/components/ui/Feedback';
import { Checkbox, Input, Select, Textarea } from '@/components/ui/Input';
import { ConfirmDialog, Modal } from '@/components/ui/Modal';
import { Pagination } from '@/components/ui/Pagination';
import { adminApi, couponApi } from '@/lib/api';
import { queryKeys } from '@/lib/queryClient';
import { useToast } from '@/hooks/useToast';
import { formatCurrency, formatDate } from '@/lib/utils';
import type { Coupon } from '@/types/api';

/**
 * An empty number input submits `''`, and `z.coerce.number()` turns that into `0` — which
 * then fails a `min(1)` rule meant for real values. Blanking an optional limit would
 * silently block the whole form. Blank is normalised to "not set" before any coercion,
 * so an optional field left alone stays optional.
 */
function optionalNumber<T extends z.ZodTypeAny>(schema: T) {
  return z.preprocess(
    (value) => (value === '' || value === null || value === undefined ? undefined : value),
    schema.optional(),
  ) as unknown as z.ZodType<z.output<T> | undefined, z.ZodTypeDef, unknown>;
}

const couponSchema = z
  .object({
    code: z
      .string()
      .trim()
      .toUpperCase()
      .min(3, 'At least 3 characters')
      .max(40)
      .regex(/^[A-Z0-9_-]+$/, 'Letters, numbers, hyphens and underscores only'),
    description: z.string().trim().max(300).optional(),
    type: z.enum(['PERCENTAGE', 'FIXED']),
    value: z.coerce.number().positive('Must be greater than zero'),
    minOrderAmount: optionalNumber(z.coerce.number().nonnegative('Cannot be negative')),
    maxDiscountAmount: optionalNumber(z.coerce.number().nonnegative('Cannot be negative')),
    usageLimit: optionalNumber(
      z.coerce.number().int('Whole numbers only').min(0, 'Use 0 or leave blank for unlimited'),
    ),
    perUserLimit: optionalNumber(
      z.coerce.number().int('Whole numbers only').min(0, 'Use 0 or leave blank for unlimited'),
    ),
    expiresAt: z.string().optional(),
    isActive: z.boolean(),
  })
  .refine((data) => data.type !== 'PERCENTAGE' || data.value <= 100, {
    message: 'A percentage discount cannot exceed 100%',
    path: ['value'],
  });

type CouponValues = z.infer<typeof couponSchema>;

export function AdminCoupons() {
  const toast = useToast();
  const client = useQueryClient();

  const [page, setPage] = useState(1);
  const [formOpen, setFormOpen] = useState(false);
  const [deleting, setDeleting] = useState<Coupon | null>(null);

  const params = { page, limit: 20, includeExpired: true };

  const { data, isLoading } = useQuery({
    queryKey: queryKeys.coupons.list(params),
    queryFn: () => couponApi.list(params),
  });

  const form = useForm<CouponValues>({
    resolver: zodResolver(couponSchema),
    defaultValues: { type: 'PERCENTAGE', isActive: true, value: 10, perUserLimit: 1 },
  });

  const invalidate = () => client.invalidateQueries({ queryKey: ['coupons'] });

  const create = useMutation({
    mutationFn: (values: CouponValues) =>
      couponApi.create({
        code: values.code,
        type: values.type,
        value: values.value,
        isActive: values.isActive,
        ...(values.description ? { description: values.description } : {}),
        ...(values.minOrderAmount ? { minOrderAmount: values.minOrderAmount } : {}),
        ...(values.maxDiscountAmount ? { maxDiscountAmount: values.maxDiscountAmount } : {}),
        ...(values.usageLimit ? { usageLimit: values.usageLimit } : {}),
        ...(values.perUserLimit ? { perUserLimit: values.perUserLimit } : {}),
        ...(values.expiresAt ? { expiresAt: new Date(values.expiresAt).toISOString() } : {}),
      }),
    onSuccess: () => {
      toast.success('Coupon created');
      setFormOpen(false);
      form.reset({ type: 'PERCENTAGE', isActive: true, value: 10, perUserLimit: 1, code: '' });
      void invalidate();
    },
    onError: (error) => toast.error(error),
  });

  const remove = useMutation({
    mutationFn: (id: string) => couponApi.remove(id),
    onSuccess: (result) => {
      // Redeemed coupons are deactivated instead of deleted, to preserve order history.
      toast.success(result.deleted ? 'Coupon deleted' : 'Coupon deactivated (it has been used before)');
      setDeleting(null);
      void invalidate();
    },
    onError: (error) => toast.error(error),
  });

  const type = form.watch('type');

  return (
    <div className="p-6 lg:p-8">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-heading-lg text-ink-900">Coupons</h1>
          <p className="mt-1 text-sm text-ink-500">
            {data?.meta ? `${data.meta.total} coupons` : 'Loading…'}
          </p>
        </div>
        <Button onClick={() => setFormOpen(true)} leftIcon={<Plus className="h-4 w-4" aria-hidden="true" />}>
          New coupon
        </Button>
      </header>

      <div className="overflow-hidden rounded-2xl border border-ink-200 bg-surface">
        {isLoading ? (
          <div className="p-5">
            <TableSkeleton rows={5} columns={5} />
          </div>
        ) : !data || data.coupons.length === 0 ? (
          <EmptyState
            icon={<Ticket className="h-7 w-7" />}
            title="No coupons yet"
            description="Create a discount code to run a promotion."
            action={<Button onClick={() => setFormOpen(true)}>New coupon</Button>}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[52rem] text-sm">
              <thead className="border-b border-ink-200 bg-ink-50 text-left">
                <tr>
                  <th scope="col" className="px-5 py-3 font-semibold text-ink-600">Code</th>
                  <th scope="col" className="px-5 py-3 font-semibold text-ink-600">Discount</th>
                  <th scope="col" className="px-5 py-3 font-semibold text-ink-600">Conditions</th>
                  <th scope="col" className="px-5 py-3 font-semibold text-ink-600">Usage</th>
                  <th scope="col" className="px-5 py-3 font-semibold text-ink-600">Expires</th>
                  <th scope="col" className="px-5 py-3 text-right font-semibold text-ink-600">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100">
                {data.coupons.map((coupon) => {
                  const expired = coupon.expiresAt ? new Date(coupon.expiresAt) < new Date() : false;

                  return (
                    <tr key={coupon.id} className="transition-colors hover:bg-ink-50">
                      <td className="px-5 py-3">
                        <p className="font-mono font-semibold text-ink-900">{coupon.code}</p>
                        {coupon.description && (
                          <p className="mt-0.5 max-w-xs truncate text-xs text-ink-500">
                            {coupon.description}
                          </p>
                        )}
                      </td>
                      <td className="px-5 py-3 text-ink-900">
                        {coupon.type === 'PERCENTAGE'
                          ? `${coupon.value}%`
                          : formatCurrency(coupon.value)}
                        {coupon.maxDiscountAmount && (
                          <p className="text-xs text-ink-500">
                            max {formatCurrency(coupon.maxDiscountAmount)}
                          </p>
                        )}
                      </td>
                      <td className="px-5 py-3 text-xs text-ink-600">
                        {coupon.minOrderAmount ? `Min ${formatCurrency(coupon.minOrderAmount)}` : 'No minimum'}
                        <br />
                        {coupon.perUserLimit ? `${coupon.perUserLimit}× per user` : 'Unlimited per user'}
                      </td>
                      <td className="px-5 py-3 text-ink-600">
                        {coupon.usedCount}
                        {coupon.usageLimit ? ` / ${coupon.usageLimit}` : ''}
                      </td>
                      <td className="px-5 py-3 text-ink-600">
                        {coupon.expiresAt ? formatDate(coupon.expiresAt) : 'Never'}
                      </td>
                      <td className="px-5 py-3">
                        <div className="flex items-center justify-end gap-2">
                          <Badge tone={expired ? 'neutral' : coupon.isActive ? 'success' : 'danger'}>
                            {expired ? 'Expired' : coupon.isActive ? 'Active' : 'Inactive'}
                          </Badge>
                          <Button
                            size="icon"
                            variant="ghost"
                            aria-label={`Delete ${coupon.code}`}
                            className="text-danger-600 hover:bg-danger-50"
                            onClick={() => setDeleting(coupon)}
                          >
                            <Trash2 className="h-4 w-4" aria-hidden="true" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {data?.meta && <Pagination meta={data.meta} onPageChange={setPage} className="mt-6" />}

      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title="New coupon"
        description="Every rule here is enforced server-side at checkout."
        size="lg"
        footer={
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={() => setFormOpen(false)}>
              Cancel
            </Button>
            <Button
              loading={create.isPending}
              onClick={form.handleSubmit((values) => create.mutate(values))}
            >
              Create coupon
            </Button>
          </div>
        }
      >
        <form className="space-y-4" onSubmit={form.handleSubmit((values) => create.mutate(values))}>
          <Input
            label="Code"
            placeholder="WELCOME10"
            className="font-mono uppercase"
            error={form.formState.errors.code?.message}
            {...form.register('code')}
          />

          <Textarea label="Description" rows={2} {...form.register('description')} />

          <div className="grid gap-4 sm:grid-cols-2">
            <Select
              label="Discount type"
              options={[
                { value: 'PERCENTAGE', label: 'Percentage off' },
                { value: 'FIXED', label: 'Fixed amount off' },
              ]}
              {...form.register('type')}
            />
            <Input
              label={type === 'PERCENTAGE' ? 'Percentage (%)' : 'Amount (₹)'}
              type="number"
              step="0.01"
              min="0"
              error={form.formState.errors.value?.message}
              {...form.register('value')}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              label="Minimum order (₹)"
              type="number"
              min="0"
              hint="Leave blank for no minimum"
              error={form.formState.errors.minOrderAmount?.message}
              {...form.register('minOrderAmount')}
            />
            <Input
              label="Maximum discount (₹)"
              type="number"
              min="0"
              hint="Caps a percentage discount"
              error={form.formState.errors.maxDiscountAmount?.message}
              {...form.register('maxDiscountAmount')}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              label="Total usage limit"
              type="number"
              min="0"
              hint="Leave blank for unlimited"
              error={form.formState.errors.usageLimit?.message}
              {...form.register('usageLimit')}
            />
            <Input
              label="Per-user limit"
              type="number"
              min="0"
              hint="Leave blank for unlimited"
              error={form.formState.errors.perUserLimit?.message}
              {...form.register('perUserLimit')}
            />
          </div>

          <Input label="Expires at" type="datetime-local" {...form.register('expiresAt')} />

          <Checkbox label="Active immediately" {...form.register('isActive')} />
        </form>
      </Modal>

      <ConfirmDialog
        open={Boolean(deleting)}
        title="Delete this coupon?"
        description={`"${deleting?.code ?? ''}" will be removed. If it has already been redeemed it is deactivated instead, so past orders keep their discount history.`}
        confirmLabel="Delete"
        variant="danger"
        loading={remove.isPending}
        onConfirm={() => deleting && remove.mutate(deleting.id)}
        onCancel={() => setDeleting(null)}
      />
    </div>
  );
}

export function AdminAnalytics() {
  const [days, setDays] = useState(30);

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'analytics', days],
    queryFn: async () => {
      const { series } = await adminApi.revenueSeries(days);
      return series;
    },
  });

  return (
    <div className="p-6 lg:p-8">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-heading-lg text-ink-900">Analytics</h1>
          <p className="mt-1 text-sm text-ink-500">Paid revenue over time.</p>
        </div>
        <div className="w-40">
          <Select
            aria-label="Time range"
            options={[
              { value: '7', label: 'Last 7 days' },
              { value: '30', label: 'Last 30 days' },
              { value: '90', label: 'Last 90 days' },
              { value: '365', label: 'Last year' },
            ]}
            value={String(days)}
            onChange={(event) => setDays(Number(event.target.value))}
          />
        </div>
      </header>

      {isLoading ? (
        <div className="flex justify-center py-16">
          <Spinner className="h-8 w-8" />
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="rounded-2xl border border-ink-200 bg-surface p-5">
            <p className="text-sm text-ink-500">Total revenue</p>
            <p className="mt-1.5 text-2xl font-bold text-ink-900">
              {formatCurrency((data ?? []).reduce((sum, point) => sum + point.revenue, 0))}
            </p>
          </div>
          <div className="rounded-2xl border border-ink-200 bg-surface p-5">
            <p className="text-sm text-ink-500">Orders</p>
            <p className="mt-1.5 text-2xl font-bold text-ink-900">
              {(data ?? []).reduce((sum, point) => sum + point.orders, 0)}
            </p>
          </div>
          <div className="rounded-2xl border border-ink-200 bg-surface p-5">
            <p className="text-sm text-ink-500">Best day</p>
            <p className="mt-1.5 text-2xl font-bold text-ink-900">
              {formatCurrency(Math.max(0, ...(data ?? []).map((point) => point.revenue)))}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
