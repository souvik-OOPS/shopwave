import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';

import { Button } from '@/components/ui/Button';
import { Checkbox, Input } from '@/components/ui/Input';
import { addressApi } from '@/lib/api';
import { queryKeys } from '@/lib/queryClient';
import { ApiRequestError } from '@/lib/apiClient';
import { useToast } from '@/hooks/useToast';
import type { Address } from '@/types/api';

/** Matches the server contract, including the Indian phone and PIN formats. */
const addressSchema = z.object({
  fullName: z.string().trim().min(1, 'Full name is required').max(100),
  phone: z
    .string()
    .trim()
    .regex(/^(?:\+91[-\s]?|0)?[6-9]\d{9}$/, 'Enter a valid 10-digit mobile number'),
  line1: z.string().trim().min(1, 'Address line 1 is required').max(200),
  line2: z.string().trim().max(200).optional(),
  city: z.string().trim().min(1, 'City is required').max(80),
  state: z.string().trim().min(1, 'State is required').max(80),
  postalCode: z.string().trim().regex(/^[1-9][0-9]{5}$/, 'Enter a valid 6-digit PIN code'),
  country: z.string().trim().min(2).max(60),
  landmark: z.string().trim().max(120).optional(),
  isDefault: z.boolean(),
});

type AddressValues = z.infer<typeof addressSchema>;

interface AddressFormProps {
  address?: Address;
  onSuccess: (address: Address) => void;
  onCancel?: () => void;
}

export function AddressForm({ address, onSuccess, onCancel }: AddressFormProps) {
  const toast = useToast();
  const client = useQueryClient();

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<AddressValues>({
    resolver: zodResolver(addressSchema),
    defaultValues: {
      fullName: address?.fullName ?? '',
      phone: address?.phone ?? '',
      line1: address?.line1 ?? '',
      line2: address?.line2 ?? '',
      city: address?.city ?? '',
      state: address?.state ?? '',
      postalCode: address?.postalCode ?? '',
      country: address?.country ?? 'India',
      landmark: address?.landmark ?? '',
      isDefault: address?.isDefault ?? false,
    },
  });

  const mutation = useMutation({
    mutationFn: (values: AddressValues) => {
      // Empty optional strings are omitted rather than sent as "".
      const payload = {
        ...values,
        ...(values.line2 ? { line2: values.line2 } : { line2: undefined }),
        ...(values.landmark ? { landmark: values.landmark } : { landmark: undefined }),
      };

      return address
        ? addressApi.update(address.id, payload)
        : addressApi.create(payload);
    },

    onSuccess: ({ address: saved }) => {
      void client.invalidateQueries({ queryKey: queryKeys.addresses });
      toast.success(address ? 'Address updated' : 'Address saved');
      onSuccess(saved);
    },

    onError: (error) => {
      // Surface server field errors on the matching inputs.
      if (error instanceof ApiRequestError && error.fieldErrors.length > 0) {
        for (const fieldError of error.fieldErrors) {
          setError(fieldError.path as keyof AddressValues, { message: fieldError.message });
        }
        return;
      }
      toast.error(error);
    },
  });

  return (
    <form onSubmit={handleSubmit((values) => mutation.mutate(values))} className="space-y-4" noValidate>
      <div className="grid gap-4 sm:grid-cols-2">
        <Input
          label="Full name"
          autoComplete="name"
          error={errors.fullName?.message}
          {...register('fullName')}
        />
        <Input
          label="Mobile number"
          type="tel"
          autoComplete="tel"
          error={errors.phone?.message}
          {...register('phone')}
        />
      </div>

      <Input
        label="Address line 1"
        autoComplete="address-line1"
        placeholder="House / flat number, building, street"
        error={errors.line1?.message}
        {...register('line1')}
      />

      <Input
        label="Address line 2"
        autoComplete="address-line2"
        placeholder="Area, colony (optional)"
        error={errors.line2?.message}
        {...register('line2')}
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <Input label="City" autoComplete="address-level2" error={errors.city?.message} {...register('city')} />
        <Input
          label="State"
          autoComplete="address-level1"
          error={errors.state?.message}
          {...register('state')}
        />
        <Input
          label="PIN code"
          inputMode="numeric"
          autoComplete="postal-code"
          maxLength={6}
          error={errors.postalCode?.message}
          {...register('postalCode')}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Input
          label="Country"
          autoComplete="country-name"
          error={errors.country?.message}
          {...register('country')}
        />
        <Input
          label="Landmark"
          placeholder="Optional"
          error={errors.landmark?.message}
          {...register('landmark')}
        />
      </div>

      <Checkbox label="Make this my default address" {...register('isDefault')} />

      <div className="flex gap-3 pt-1">
        <Button type="submit" loading={mutation.isPending}>
          {address ? 'Save changes' : 'Save address'}
        </Button>
        {onCancel && (
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
        )}
      </div>
    </form>
  );
}
