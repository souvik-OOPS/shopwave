import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Search } from 'lucide-react';

import { useAppSelector } from '@/app/store';
import { Badge, OrderStatusBadge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { EmptyState, ErrorState, Spinner, TableSkeleton } from '@/components/ui/Feedback';
import { Select } from '@/components/ui/Input';
import { Input } from '@/components/ui/Input';
import { Pagination } from '@/components/ui/Pagination';
import { adminApi } from '@/lib/api';
import { queryKeys } from '@/lib/queryClient';
import { useDebouncedValue } from '@/hooks/useCatalog';
import { useToast } from '@/hooks/useToast';
import { formatCurrency, formatDate, initials } from '@/lib/utils';

const ROLE_OPTIONS = [
  { value: '', label: 'All roles' },
  { value: 'CUSTOMER', label: 'Customer' },
  { value: 'STAFF', label: 'Staff' },
  { value: 'ADMIN', label: 'Admin' },
];

export function AdminCustomers() {
  const [search, setSearch] = useState('');
  const [role, setRole] = useState('');
  const [page, setPage] = useState(1);

  const debouncedSearch = useDebouncedValue(search, 400);
  const params = {
    page,
    limit: 20,
    ...(debouncedSearch ? { q: debouncedSearch } : {}),
    ...(role ? { role } : {}),
  };

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: queryKeys.admin.users(params),
    queryFn: () => adminApi.users(params),
  });

  return (
    <div className="p-6 lg:p-8">
      <header className="mb-6">
        <h1 className="text-heading-lg text-ink-900">Customers</h1>
        <p className="mt-1 text-sm text-ink-500">
          {data?.meta ? `${data.meta.total} accounts` : 'Loading…'}
        </p>
      </header>

      <div className="mb-5 flex flex-wrap gap-3">
        <Input
          aria-label="Search customers"
          placeholder="Name, email or phone"
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
            setPage(1);
          }}
          leftIcon={<Search className="h-4 w-4" aria-hidden="true" />}
          containerClassName="flex-1 min-w-64"
        />
        <div className="w-full sm:w-44">
          <Select
            aria-label="Filter by role"
            options={ROLE_OPTIONS}
            value={role}
            onChange={(event) => {
              setRole(event.target.value);
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
        ) : !data || data.users.length === 0 ? (
          <EmptyState title="No customers found" description="Try a different search term." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[48rem] text-sm">
              <thead className="border-b border-ink-200 bg-ink-50 text-left">
                <tr>
                  <th scope="col" className="px-5 py-3 font-semibold text-ink-600">Customer</th>
                  <th scope="col" className="px-5 py-3 font-semibold text-ink-600">Role</th>
                  <th scope="col" className="px-5 py-3 font-semibold text-ink-600">Orders</th>
                  <th scope="col" className="px-5 py-3 font-semibold text-ink-600">Joined</th>
                  <th scope="col" className="px-5 py-3 font-semibold text-ink-600">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100">
                {data.users.map((user) => (
                  <tr key={user.id} className="transition-colors hover:bg-ink-50">
                    <td className="px-5 py-3">
                      <Link to={`/admin/customers/${user.id}`} className="flex items-center gap-3">
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-600 text-xs font-bold text-white">
                          {initials(user.firstName, user.lastName)}
                        </span>
                        <div className="min-w-0">
                          <p className="truncate font-medium text-ink-900">
                            {user.firstName} {user.lastName}
                          </p>
                          <p className="truncate text-xs text-ink-500">{user.email}</p>
                        </div>
                      </Link>
                    </td>
                    <td className="px-5 py-3">
                      <Badge tone={user.role === 'ADMIN' ? 'brand' : user.role === 'STAFF' ? 'info' : 'neutral'}>
                        {user.role}
                      </Badge>
                    </td>
                    <td className="px-5 py-3 text-ink-600">{user.orderCount}</td>
                    <td className="px-5 py-3 text-ink-600">{formatDate(user.createdAt)}</td>
                    <td className="px-5 py-3">
                      <Badge tone={user.isActive ? 'success' : 'danger'}>
                        {user.isActive ? 'Active' : 'Disabled'}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {data?.meta && <Pagination meta={data.meta} onPageChange={setPage} className="mt-6" />}
    </div>
  );
}

export function AdminCustomerDetail() {
  const { id } = useParams<{ id: string }>();
  const toast = useToast();
  const client = useQueryClient();
  const currentUser = useAppSelector((state) => state.auth.user);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: queryKeys.admin.userDetail(id ?? ''),
    queryFn: async () => {
      const { user } = await adminApi.user(id as string);
      return user;
    },
    enabled: Boolean(id),
  });

  const updateUser = useMutation({
    mutationFn: (payload: { role?: string; isActive?: boolean }) =>
      adminApi.updateUser(id as string, payload),
    onSuccess: () => {
      toast.success('Customer updated');
      void client.invalidateQueries({ queryKey: ['admin'] });
    },
    // The server refuses self-demotion and removing the last admin — both surface here.
    onError: (error) => toast.error(error),
  });

  if (isLoading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Spinner className="h-8 w-8" />
      </div>
    );
  }

  if (isError || !data) return <ErrorState className="py-24" onRetry={() => void refetch()} />;

  const isSelf = currentUser?.id === data.id;

  return (
    <div className="p-6 lg:p-8">
      <Link
        to="/admin/customers"
        className="mb-6 inline-flex items-center gap-1.5 text-sm font-medium text-ink-600 hover:text-ink-900"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Back to customers
      </Link>

      <header className="mb-6 flex flex-wrap items-center gap-4">
        <span className="flex h-14 w-14 items-center justify-center rounded-full bg-brand-600 text-lg font-bold text-white">
          {initials(data.firstName, data.lastName)}
        </span>
        <div>
          <h1 className="text-heading text-ink-900">
            {data.firstName} {data.lastName}
          </h1>
          <p className="text-sm text-ink-500">{data.email}</p>
        </div>
        <div className="ml-auto flex gap-2">
          <Badge tone={data.isActive ? 'success' : 'danger'}>
            {data.isActive ? 'Active' : 'Disabled'}
          </Badge>
          <Badge tone="brand">{data.role}</Badge>
        </div>
      </header>

      <div className="grid gap-4 sm:grid-cols-3">
        {[
          { label: 'Lifetime value', value: formatCurrency(data.lifetimeValue) },
          { label: 'Paid orders', value: String(data.paidOrderCount) },
          { label: 'Reviews written', value: String(data.reviewCount) },
        ].map((stat) => (
          <div key={stat.label} className="rounded-2xl border border-ink-200 bg-surface p-5">
            <p className="text-sm text-ink-500">{stat.label}</p>
            <p className="mt-1.5 text-2xl font-bold text-ink-900">{stat.value}</p>
          </div>
        ))}
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_20rem]">
        <section className="rounded-2xl border border-ink-200 bg-surface p-5">
          <h2 className="text-base font-semibold text-ink-900">Recent orders</h2>
          {data.recentOrders.length === 0 ? (
            <p className="mt-3 text-sm text-ink-500">This customer has not ordered yet.</p>
          ) : (
            <ul className="mt-4 divide-y divide-ink-100">
              {data.recentOrders.map((order) => (
                <li key={order.id} className="py-3">
                  <Link to={`/admin/orders/${order.id}`} className="flex items-center gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-ink-900">{order.orderNumber}</p>
                      <p className="text-xs text-ink-500">{formatDate(order.createdAt)}</p>
                    </div>
                    <OrderStatusBadge status={order.status} />
                    <span className="w-24 text-right font-semibold text-ink-900">
                      {formatCurrency(order.total)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <aside className="space-y-6">
          <section className="rounded-2xl border border-ink-200 bg-surface p-5">
            <h2 className="text-base font-semibold text-ink-900">Account controls</h2>

            {isSelf && (
              <p className="mt-2 rounded-lg bg-warning-50 p-2.5 text-xs text-warning-700">
                You cannot change your own role or disable your own account.
              </p>
            )}

            <div className="mt-4 space-y-4">
              <Select
                label="Role"
                disabled={isSelf || updateUser.isPending}
                options={[
                  { value: 'CUSTOMER', label: 'Customer' },
                  { value: 'STAFF', label: 'Staff' },
                  { value: 'ADMIN', label: 'Admin' },
                ]}
                value={data.role}
                onChange={(event) => updateUser.mutate({ role: event.target.value })}
              />

              <Button
                fullWidth
                variant={data.isActive ? 'danger' : 'primary'}
                disabled={isSelf}
                loading={updateUser.isPending}
                onClick={() => updateUser.mutate({ isActive: !data.isActive })}
              >
                {data.isActive ? 'Disable account' : 'Enable account'}
              </Button>

              <p className="text-xs leading-relaxed text-ink-500">
                Disabling an account revokes every active session immediately, not when the token
                would have expired.
              </p>
            </div>
          </section>

          <section className="rounded-2xl border border-ink-200 bg-surface p-5">
            <h2 className="text-base font-semibold text-ink-900">Addresses</h2>
            {data.addresses.length === 0 ? (
              <p className="mt-3 text-sm text-ink-500">No saved addresses.</p>
            ) : (
              <ul className="mt-3 space-y-3 text-sm">
                {data.addresses.map((address) => (
                  <li key={address.id} className="rounded-lg bg-ink-50 p-3">
                    <p className="font-medium text-ink-900">{address.fullName}</p>
                    <p className="mt-0.5 text-ink-600">
                      {address.line1}, {address.city}, {address.state} {address.postalCode}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </aside>
      </div>
    </div>
  );
}
