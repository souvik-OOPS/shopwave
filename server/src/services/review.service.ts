import type { Prisma } from '@prisma/client';

import { prisma } from '@/lib/prisma';
import { cacheInvalidate } from '@/lib/redis';
import { orderRepository } from '@/repositories/order.repository';
import { productRepository } from '@/repositories/product.repository';
import {
  reviewRepository,
  type AdminReviewRow,
  type ReviewRow,
} from '@/repositories/review.repository';
import type { CreateReviewInput, ReviewQuery, UpdateReviewInput } from '@/schemas/review.schema';
import { ApiError, ErrorCode } from '@/utils/ApiError';
import { resolvePagination } from '@/utils/pagination';

function serializeReview(review: ReviewRow) {
  return {
    id: review.id,
    productId: review.productId,
    rating: review.rating,
    title: review.title,
    comment: review.comment,
    isVerifiedPurchase: review.isVerifiedPurchase,
    status: review.status,
    helpfulCount: review.helpfulCount,
    images: review.images,
    author: {
      id: review.user.id,
      // Surname reduced to an initial — reviews are public, full names need not be.
      name: `${review.user.firstName} ${review.user.lastName.charAt(0)}.`.trim(),
      avatarUrl: review.user.avatarUrl,
    },
    createdAt: review.createdAt,
    updatedAt: review.updatedAt,
  };
}

/**
 * A review for the moderation queue: the public shape plus the product it belongs to.
 *
 * The author is abbreviated exactly as it is on the storefront. Staff can moderate
 * reviews but not open the customer directory, so this screen is not the place to widen
 * what they can see about a customer.
 */
function serializeAdminReview(review: AdminReviewRow) {
  return {
    ...serializeReview(review),
    product: review.product,
  };
}

export const reviewService = {
  async listForProduct(productSlug: string, query: ReviewQuery) {
    const product = await prisma.product.findFirst({
      where: { slug: productSlug, deletedAt: null },
      select: { id: true, ratingAverage: true, reviewCount: true },
    });

    if (!product) throw ApiError.notFound('Product not found', ErrorCode.PRODUCT_NOT_FOUND);

    const { skip, take, page, limit } = resolvePagination(query);
    const { items, total } = await reviewRepository.findForProduct(product.id, query, skip, take);
    const distribution = await reviewRepository.ratingDistribution(product.id);

    return {
      items: items.map(serializeReview),
      total,
      page,
      limit,
      summary: {
        ratingAverage: product.ratingAverage,
        reviewCount: product.reviewCount,
        distribution,
      },
    };
  },

  async listMine(userId: string, query: ReviewQuery) {
    const { skip, take, page, limit } = resolvePagination(query);
    const items = await reviewRepository.findByUser(userId, skip, take);
    return { items, page, limit };
  },

  /**
   * One review per customer per product, and the "Verified Purchase" badge is granted
   * only when a matching delivered order item exists. Both facts are established here
   * from the database — neither is influenced by the request body.
   */
  async create(userId: string, input: CreateReviewInput) {
    const product = await prisma.product.findFirst({
      where: { id: input.productId, deletedAt: null },
      select: { id: true },
    });
    if (!product) throw ApiError.notFound('Product not found', ErrorCode.PRODUCT_NOT_FOUND);

    const existing = await reviewRepository.findByUserAndProduct(userId, input.productId);
    if (existing) {
      throw ApiError.conflict(
        'You have already reviewed this product. Edit your existing review instead.',
        ErrorCode.REVIEW_ALREADY_EXISTS,
      );
    }

    const purchasedItem = await orderRepository.findDeliveredItemForProduct(userId, input.productId);

    // Business rule: only buyers may review at all. Relaxing this to "anyone may review,
    // buyers get a badge" is a one-line change here.
    if (!purchasedItem) {
      throw ApiError.forbidden(
        'Only customers who purchased and received this product can review it',
        ErrorCode.PURCHASE_REQUIRED,
      );
    }

    const review = await prisma.$transaction(async (tx) => {
      const created = await reviewRepository.create(
        {
          productId: input.productId,
          userId,
          orderItemId: purchasedItem.id,
          rating: input.rating,
          comment: input.comment,
          isVerifiedPurchase: true,
          status: 'APPROVED',
          ...(input.title ? { title: input.title } : {}),
        },
        input.images,
        tx,
      );

      await productRepository.refreshRatingAggregate(input.productId, tx);
      return created;
    });

    await cacheInvalidate('products:*');
    return serializeReview(review);
  },

  async update(userId: string, reviewId: string, input: UpdateReviewInput) {
    const existing = await reviewRepository.findById(reviewId);
    if (!existing) throw ApiError.notFound('Review not found', ErrorCode.REVIEW_NOT_FOUND);

    if (existing.userId !== userId) {
      throw ApiError.forbidden('You can only edit your own reviews');
    }

    const updated = await prisma.$transaction(async (tx) => {
      const data: Prisma.ReviewUpdateInput = {
        ...(input.rating !== undefined ? { rating: input.rating } : {}),
        ...(input.title !== undefined ? { title: input.title } : {}),
        ...(input.comment !== undefined ? { comment: input.comment } : {}),
      };

      const review = await reviewRepository.update(reviewId, data, tx);

      if (input.images) await reviewRepository.replaceImages(reviewId, input.images, tx);

      // The stored average must follow every rating change.
      if (input.rating !== undefined) {
        await productRepository.refreshRatingAggregate(existing.productId, tx);
      }

      return review;
    });

    await cacheInvalidate('products:*');
    return serializeReview(updated);
  },

  /** Customers delete their own; staff may delete any (moderation). */
  async remove(userId: string, reviewId: string, isStaff: boolean): Promise<void> {
    const existing = await reviewRepository.findById(reviewId);
    if (!existing) throw ApiError.notFound('Review not found', ErrorCode.REVIEW_NOT_FOUND);

    if (existing.userId !== userId && !isStaff) {
      throw ApiError.forbidden('You can only delete your own reviews');
    }

    await prisma.$transaction(async (tx) => {
      await reviewRepository.delete(reviewId, tx);
      await productRepository.refreshRatingAggregate(existing.productId, tx);
    });

    await cacheInvalidate('products:*');
  },

  /** Whether the signed-in user may review this product, and whether they already have. */
  async eligibility(userId: string, productId: string) {
    const [existing, purchased] = await Promise.all([
      reviewRepository.findByUserAndProduct(userId, productId),
      orderRepository.findDeliveredItemForProduct(userId, productId),
    ]);

    return {
      canReview: Boolean(purchased) && !existing,
      hasReviewed: Boolean(existing),
      hasPurchased: Boolean(purchased),
      reviewId: existing?.id ?? null,
    };
  },

  // ----- moderation -------------------------------------------------------

  async listAdmin(query: ReviewQuery & { status?: 'PENDING' | 'APPROVED' | 'REJECTED' }) {
    const { skip, take, page, limit } = resolvePagination(query);
    const where: Prisma.ReviewWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.rating ? { rating: query.rating } : {}),
    };

    const { items, total } = await reviewRepository.findManyAdmin(where, skip, take);
    // Serialised like every other review response. Returning raw repository rows here
    // handed the moderation screen a `user` relation where its `author` was, which is a
    // contract the frontend cannot see broken until it renders.
    return { items: items.map(serializeAdminReview), total, page, limit };
  },

  async moderate(reviewId: string, status: 'PENDING' | 'APPROVED' | 'REJECTED') {
    const existing = await reviewRepository.findById(reviewId);
    if (!existing) throw ApiError.notFound('Review not found', ErrorCode.REVIEW_NOT_FOUND);

    const updated = await prisma.$transaction(async (tx) => {
      const review = await reviewRepository.update(reviewId, { status }, tx);
      // Rejecting a review must remove it from the product's average, not just hide it.
      await productRepository.refreshRatingAggregate(existing.productId, tx);
      return review;
    });

    await cacheInvalidate('products:*');
    return serializeReview(updated);
  },
};
