import type { Address } from '@prisma/client';

import { prisma } from '@/lib/prisma';
import { addressRepository } from '@/repositories/address.repository';
import type { CreateAddressInput, UpdateAddressInput } from '@/schemas/address.schema';
import { ApiError, ErrorCode } from '@/utils/ApiError';

const MAX_ADDRESSES_PER_USER = 15;

export const addressService = {
  list(userId: string): Promise<Address[]> {
    return addressRepository.findByUser(userId);
  },

  async get(userId: string, id: string): Promise<Address> {
    const address = await addressRepository.findOwned(id, userId);
    if (!address) throw ApiError.notFound('Address not found', ErrorCode.ADDRESS_NOT_FOUND);
    return address;
  },

  /**
   * The first address a user saves becomes their default automatically — otherwise
   * checkout would open with nothing selected for every new customer.
   */
  async create(userId: string, input: CreateAddressInput): Promise<Address> {
    const existingCount = await addressRepository.count(userId);

    if (existingCount >= MAX_ADDRESSES_PER_USER) {
      throw ApiError.badRequest(`You can save at most ${MAX_ADDRESSES_PER_USER} addresses`);
    }

    const shouldBeDefault = input.isDefault || existingCount === 0;

    return prisma.$transaction(async (tx) => {
      if (shouldBeDefault) await addressRepository.clearDefault(userId, undefined, tx);

      return addressRepository.create(
        {
          userId,
          fullName: input.fullName,
          phone: input.phone,
          line1: input.line1,
          city: input.city,
          state: input.state,
          postalCode: input.postalCode,
          country: input.country,
          isDefault: shouldBeDefault,
          ...(input.line2 ? { line2: input.line2 } : {}),
          ...(input.landmark ? { landmark: input.landmark } : {}),
        },
        tx,
      );
    });
  },

  async update(userId: string, id: string, input: UpdateAddressInput): Promise<Address> {
    await this.get(userId, id);

    return prisma.$transaction(async (tx) => {
      if (input.isDefault === true) await addressRepository.clearDefault(userId, id, tx);
      return addressRepository.update(id, input, tx);
    });
  },

  /**
   * Deleting the default promotes the next address so the account is never left
   * without one while other addresses still exist.
   */
  async remove(userId: string, id: string): Promise<void> {
    const address = await this.get(userId, id);

    await addressRepository.delete(id);

    if (address.isDefault) {
      const remaining = await addressRepository.findByUser(userId);
      const next = remaining[0];
      if (next) await addressRepository.update(next.id, { isDefault: true });
    }
  },

  async setDefault(userId: string, id: string): Promise<Address> {
    await this.get(userId, id);

    return prisma.$transaction(async (tx) => {
      await addressRepository.clearDefault(userId, id, tx);
      return addressRepository.update(id, { isDefault: true }, tx);
    });
  },
};
