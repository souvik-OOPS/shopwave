import type { Address, Prisma } from '@prisma/client';

import { prisma, type PrismaTransactionClient } from '@/lib/prisma';

export const addressRepository = {
  findByUser(userId: string): Promise<Address[]> {
    return prisma.address.findMany({
      where: { userId },
      orderBy: [{ isDefault: 'desc' }, { updatedAt: 'desc' }],
    });
  },

  /** Ownership is part of the lookup, so a foreign id simply resolves to null. */
  findOwned(id: string, userId: string): Promise<Address | null> {
    return prisma.address.findFirst({ where: { id, userId } });
  },

  findDefault(userId: string): Promise<Address | null> {
    return prisma.address.findFirst({ where: { userId, isDefault: true } });
  },

  count(userId: string): Promise<number> {
    return prisma.address.count({ where: { userId } });
  },

  create(data: Prisma.AddressUncheckedCreateInput, client: PrismaTransactionClient = prisma): Promise<Address> {
    return client.address.create({ data });
  },

  update(id: string, data: Prisma.AddressUpdateInput, client: PrismaTransactionClient = prisma): Promise<Address> {
    return client.address.update({ where: { id }, data });
  },

  delete(id: string): Promise<Address> {
    return prisma.address.delete({ where: { id } });
  },

  /** "Exactly one default" is enforced by clearing the flag everywhere else first. */
  clearDefault(userId: string, exceptId?: string, client: PrismaTransactionClient = prisma) {
    return client.address.updateMany({
      where: { userId, isDefault: true, ...(exceptId ? { id: { not: exceptId } } : {}) },
      data: { isDefault: false },
    });
  },
};
