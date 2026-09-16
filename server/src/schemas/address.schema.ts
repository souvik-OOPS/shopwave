import { z } from 'zod';

import { nonEmptyString, phoneSchema, postalCodeSchema } from '@/schemas/common.schema';

export const createAddressSchema = z
  .object({
    fullName: nonEmptyString(100, 'Full name'),
    phone: phoneSchema,
    line1: nonEmptyString(200, 'Address line 1'),
    line2: z.string().trim().max(200).optional(),
    city: nonEmptyString(80, 'City'),
    state: nonEmptyString(80, 'State'),
    postalCode: postalCodeSchema,
    country: z.string().trim().min(2).max(60).default('India'),
    landmark: z.string().trim().max(120).optional(),
    isDefault: z.boolean().default(false),
  })
  .strict();

export const updateAddressSchema = createAddressSchema
  .partial()
  .strict()
  .refine((data) => Object.keys(data).length > 0, { message: 'Provide at least one field to update' });

export type CreateAddressInput = z.infer<typeof createAddressSchema>;
export type UpdateAddressInput = z.infer<typeof updateAddressSchema>;
