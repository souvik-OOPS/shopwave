import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { BadgeCheck, MapPin, Pencil, Plus, Trash2 } from 'lucide-react';

import { useAppDispatch, useAppSelector } from '@/app/store';
import { setUser } from '@/features/auth/authSlice';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { EmptyState, Spinner } from '@/components/ui/Feedback';
import { Input } from '@/components/ui/Input';
import { ConfirmDialog, Modal } from '@/components/ui/Modal';
import { AddressForm } from '@/components/account/AddressForm';
import { addressApi, authApi } from '@/lib/api';
import { queryKeys } from '@/lib/queryClient';
import { useToast } from '@/hooks/useToast';
import { formatDate } from '@/lib/utils';
import type { Address } from '@/types/api';

// ── Profile ─────────────────────────────────────────────────────────────────

const profileSchema = z.object({
  firstName: z.string().trim().min(1, 'First name is required').max(60),
  lastName: z.string().trim().min(1, 'Last name is required').max(60),
  phone: z
    .string()
    .trim()
    .regex(/^(?:\+91[-\s]?|0)?[6-9]\d{9}$/, 'Enter a valid 10-digit mobile number')
    .or(z.literal('')),
});

const passwordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Current password is required'),
    newPassword: z
      .string()
      .min(8, 'At least 8 characters')
      .regex(/[a-z]/, 'Must include a lowercase letter')
      .regex(/[A-Z]/, 'Must include an uppercase letter')
      .regex(/[0-9]/, 'Must include a number'),
    confirmPassword: z.string().min(1, 'Please confirm your new password'),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });

export function ProfilePage() {
  const dispatch = useAppDispatch();
  const user = useAppSelector((state) => state.auth.user);
  const toast = useToast();

  const profileForm = useForm<z.infer<typeof profileSchema>>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      firstName: user?.firstName ?? '',
      lastName: user?.lastName ?? '',
      phone: user?.phone ?? '',
    },
  });

  const passwordForm = useForm<z.infer<typeof passwordSchema>>({ resolver: zodResolver(passwordSchema) });

  const updateProfile = useMutation({
    mutationFn: (values: z.infer<typeof profileSchema>) =>
      authApi.updateProfile({
        firstName: values.firstName,
        lastName: values.lastName,
        phone: values.phone || null,
      }),
    onSuccess: ({ user: updated }) => {
      dispatch(setUser(updated));
      toast.success('Profile updated');
    },
    onError: (error) => toast.error(error),
  });

  const changePassword = useMutation({
    mutationFn: (values: z.infer<typeof passwordSchema>) =>
      authApi.changePassword({
        currentPassword: values.currentPassword,
        newPassword: values.newPassword,
      }),
    onSuccess: () => {
      // The server revokes every session on a password change, so a fresh sign-in
      // is required — reloading takes the user to the login screen.
      toast.success('Password changed', 'Please sign in again with your new password.');
      window.setTimeout(() => window.location.assign('/login'), 1200);
    },
    onError: (error) => toast.error(error),
  });

  if (!user) return null;

  return (
    <div className="container-page py-8">
      <header className="mb-8">
        <h1 className="text-heading-lg text-ink-900">Profile</h1>
        <p className="mt-1 text-sm text-ink-500">Manage your personal details and password.</p>
      </header>

      {/*
        `min-w-0` on the cards, not just on the text inside them: a grid item defaults to
        `min-width: auto`, so it refuses to shrink below its content's minimum — and a
        truncated, `white-space: nowrap` email address reports its *full* width as that
        minimum. Without this the card grows past the viewport on a narrow screen and
        takes the whole page into horizontal scroll.
      */}
      <div className="grid gap-6 lg:grid-cols-2">
        <section className="min-w-0 rounded-2xl border border-ink-200 p-6">
          <h2 className="text-base font-semibold text-ink-900">Personal details</h2>

          <div className="mt-4 flex items-center gap-3 rounded-xl bg-ink-50 p-3.5">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-ink-900">{user.email}</p>
              <p className="mt-0.5 text-xs text-ink-500">Member since {formatDate(user.createdAt)}</p>
            </div>
            {user.emailVerified ? (
              <Badge tone="success" className="ml-auto" icon={<BadgeCheck className="h-3 w-3" />}>
                Verified
              </Badge>
            ) : (
              <Badge tone="warning" className="ml-auto">
                Unverified
              </Badge>
            )}
          </div>

          <form
            className="mt-5 space-y-4"
            onSubmit={profileForm.handleSubmit((values) => updateProfile.mutate(values))}
            noValidate
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <Input
                label="First name"
                error={profileForm.formState.errors.firstName?.message}
                {...profileForm.register('firstName')}
              />
              <Input
                label="Last name"
                error={profileForm.formState.errors.lastName?.message}
                {...profileForm.register('lastName')}
              />
            </div>

            <Input
              label="Mobile number"
              type="tel"
              hint="Used for delivery updates"
              error={profileForm.formState.errors.phone?.message}
              {...profileForm.register('phone')}
            />

            <Button type="submit" loading={updateProfile.isPending}>
              Save changes
            </Button>
          </form>
        </section>

        <section className="min-w-0 rounded-2xl border border-ink-200 p-6">
          <h2 className="text-base font-semibold text-ink-900">Change password</h2>
          <p className="mt-1 text-sm text-ink-500">
            Changing your password signs you out of every device.
          </p>

          <form
            className="mt-5 space-y-4"
            onSubmit={passwordForm.handleSubmit((values) => changePassword.mutate(values))}
            noValidate
          >
            <Input
              label="Current password"
              type="password"
              autoComplete="current-password"
              error={passwordForm.formState.errors.currentPassword?.message}
              {...passwordForm.register('currentPassword')}
            />
            <Input
              label="New password"
              type="password"
              autoComplete="new-password"
              error={passwordForm.formState.errors.newPassword?.message}
              {...passwordForm.register('newPassword')}
            />
            <Input
              label="Confirm new password"
              type="password"
              autoComplete="new-password"
              error={passwordForm.formState.errors.confirmPassword?.message}
              {...passwordForm.register('confirmPassword')}
            />

            <Button type="submit" variant="secondary" loading={changePassword.isPending}>
              Change password
            </Button>
          </form>
        </section>
      </div>
    </div>
  );
}

// ── Addresses ───────────────────────────────────────────────────────────────

export function AddressesPage() {
  const toast = useToast();
  const client = useQueryClient();

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Address | null>(null);
  const [deleting, setDeleting] = useState<Address | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: queryKeys.addresses,
    queryFn: () => addressApi.list(),
  });

  const invalidate = () => client.invalidateQueries({ queryKey: queryKeys.addresses });

  const removeAddress = useMutation({
    mutationFn: (id: string) => addressApi.remove(id),
    onSuccess: () => {
      toast.success('Address deleted');
      setDeleting(null);
      void invalidate();
    },
    onError: (error) => toast.error(error),
  });

  const setDefault = useMutation({
    mutationFn: (id: string) => addressApi.setDefault(id),
    onSuccess: () => {
      toast.success('Default address updated');
      void invalidate();
    },
    onError: (error) => toast.error(error),
  });

  const addresses = data?.addresses ?? [];

  return (
    <div className="container-page py-8">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-heading-lg text-ink-900">Addresses</h1>
          <p className="mt-1 text-sm text-ink-500">Where we deliver your orders.</p>
        </div>
        <Button
          onClick={() => {
            setEditing(null);
            setFormOpen(true);
          }}
          leftIcon={<Plus className="h-4 w-4" aria-hidden="true" />}
        >
          Add address
        </Button>
      </header>

      {isLoading ? (
        <div className="flex justify-center py-16">
          <Spinner className="h-8 w-8" />
        </div>
      ) : addresses.length === 0 ? (
        <EmptyState
          icon={<MapPin className="h-7 w-7" />}
          title="No saved addresses"
          description="Add an address to speed up checkout next time."
          action={<Button onClick={() => setFormOpen(true)}>Add your first address</Button>}
        />
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {addresses.map((address) => (
            <li key={address.id} className="rounded-2xl border border-ink-200 p-5">
              <div className="flex items-start justify-between gap-3">
                <p className="font-semibold text-ink-900">{address.fullName}</p>
                {address.isDefault && <Badge tone="brand">Default</Badge>}
              </div>

              <address className="mt-2 text-sm not-italic leading-relaxed text-ink-600">
                {address.line1}
                {address.line2 && (
                  <>
                    <br />
                    {address.line2}
                  </>
                )}
                <br />
                {address.city}, {address.state} {address.postalCode}
                <br />
                {address.country}
                {address.landmark && (
                  <>
                    <br />
                    <span className="text-ink-500">Landmark: {address.landmark}</span>
                  </>
                )}
                <br />
                <span className="text-ink-500">{address.phone}</span>
              </address>

              <div className="mt-4 flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setEditing(address);
                    setFormOpen(true);
                  }}
                  leftIcon={<Pencil className="h-3.5 w-3.5" aria-hidden="true" />}
                >
                  Edit
                </Button>

                {!address.isDefault && (
                  <Button
                    size="sm"
                    variant="ghost"
                    loading={setDefault.isPending}
                    onClick={() => setDefault.mutate(address.id)}
                  >
                    Set default
                  </Button>
                )}

                <Button
                  size="sm"
                  variant="ghost"
                  className="ml-auto text-danger-600 hover:bg-danger-50"
                  aria-label={`Delete address for ${address.fullName}`}
                  onClick={() => setDeleting(address)}
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
        title={editing ? 'Edit address' : 'Add a new address'}
        size="lg"
      >
        <AddressForm
          {...(editing ? { address: editing } : {})}
          onSuccess={() => {
            setFormOpen(false);
            setEditing(null);
          }}
          onCancel={() => setFormOpen(false)}
        />
      </Modal>

      <ConfirmDialog
        open={Boolean(deleting)}
        title="Delete this address?"
        description={`"${deleting?.fullName ?? ''}" will be removed from your address book. This cannot be undone.`}
        confirmLabel="Delete"
        variant="danger"
        loading={removeAddress.isPending}
        onConfirm={() => deleting && removeAddress.mutate(deleting.id)}
        onCancel={() => setDeleting(null)}
      />
    </div>
  );
}
