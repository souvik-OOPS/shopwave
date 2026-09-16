import type { Prisma, Review } from '@prisma/client';

import { prisma, type PrismaTransactionClient } from '@/lib/prisma';
import type { ReviewQuery } from '@/schemas/review.schema';

export const reviewInclude = {
  user: { select: { id: true, firstName: true, lastName: true, avatarUrl: true } },
  images: { select: { id: true, url: true } },
} satisfies Prisma.ReviewInclude;

export type ReviewRow = Prisma.ReviewGetPayload<{ include: typeof reviewInclude }>;

/** The moderation queue also needs to say which product a review is about. */
export const adminReviewInclude = {
  ...reviewInclude,
  product: { select: { id: true, name: true, slug: true } },
} satisfies Prisma.ReviewInclude;

export type AdminReviewRow = Prisma.ReviewGetPayload<{ include: typeof adminReviewInclude }>;

function buildOrderBy(sort: ReviewQuery['sort']): Prisma.ReviewOrderByWithRelationInput[] {
  switch (sort) {
    case 'oldest':
      return [{ createdAt: 'asc' }];
    case 'highest':
      return [{ rating: 'desc' }, { createdAt: 'desc' }];
    case 'lowest':
      return [{ rating: 'asc' }, { createdAt: 'desc' }];
    case 'helpful':
      return [{ helpfulCount: 'desc' }, { createdAt: 'desc' }];
    case 'newest':
    default:
      return [{ createdAt: 'desc' }];
  }
}

export const reviewRepository = {
  async findForProduct(productId: string, query: ReviewQuery, skip: number, take: number) {
    const where: Prisma.ReviewWhereInput = {
      productId,
      status: 'APPROVED',
      ...(query.rating ? { rating: query.rating } : {}),
      ...(query.verifiedOnly ? { isVerifiedPurchase: true } : {}),
    };

    const [items, total] = await prisma.$transaction([
      prisma.review.findMany({ where, orderBy: buildOrderBy(query.sort), skip, take, include: reviewInclude }),
      prisma.review.count({ where }),
    ]);

    return { items, total };
  },

  /** Star histogram for the ratings breakdown bar chart. */
  async ratingDistribution(productId: string): Promise<Record<number, number>> {
    const rows = await prisma.review.groupBy({
      by: ['rating'],
      where: { productId, status: 'APPROVED' },
      _count: { rating: true },
    });

    const distribution: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    for (const row of rows) distribution[row.rating] = row._count.rating;
    return distribution;
  },

  findById(id: string) {
    return prisma.review.findUnique({ where: { id }, include: reviewInclude });
  },

  findByUserAndProduct(userId: string, productId: string): Promise<Review | null> {
    return prisma.review.findUnique({ where: { productId_userId: { productId, userId } } });
  },

  findByUser(userId: string, skip: number, take: number) {
    return prisma.review.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      skip,
      take,
      include: {
        ...reviewInclude,
        product: {
          select: {
            id: true,
            name: true,
            slug: true,
            images: { select: { url: true }, take: 1, orderBy: { isPrimary: 'desc' } },
          },
        },
      },
    });
  },

  create(
    data: Prisma.ReviewUncheckedCreateInput,
    images: string[],
    client: PrismaTransactionClient = prisma,
  ) {
    return client.review.create({
      data: {
        ...data,
        ...(images.length > 0 ? { images: { createMany: { data: images.map((url) => ({ url })) } } } : {}),
      },
      include: reviewInclude,
    });
  },

  update(id: string, data: Prisma.ReviewUpdateInput, client: PrismaTransactionClient = prisma) {
    return client.review.update({ where: { id }, data, include: reviewInclude });
  },

  /** Replace-in-full: the edit form always posts the complete desired image list. */
  async replaceImages(
    reviewId: string,
    urls: string[],
    client: PrismaTransactionClient = prisma,
  ): Promise<void> {
    await client.reviewImage.deleteMany({ where: { reviewId } });
    if (urls.length > 0) {
      await client.reviewImage.createMany({ data: urls.map((url) => ({ reviewId, url })) });
    }
  },

  delete(id: string, client: PrismaTransactionClient = prisma) {
    return client.review.delete({ where: { id } });
  },

  async findManyAdmin(where: Prisma.ReviewWhereInput, skip: number, take: number) {
    const [items, total] = await prisma.$transaction([
      prisma.review.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take,
        include: adminReviewInclude,
      }),
      prisma.review.count({ where }),
    ]);

    return { items, total };
  },
};
