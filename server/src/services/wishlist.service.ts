import { prisma } from '@/lib/prisma';
import { wishlistRepository, type WishlistItemRow } from '@/repositories/wishlist.repository';
import { cartService } from '@/services/cart.service';
import type { CartView } from '@/services/cart.service';
import { ApiError, ErrorCode } from '@/utils/ApiError';
import { buildPriceView, buildStockView } from '@/utils/serializers';

export interface WishlistView {
  id: string;
  items: ReturnType<typeof serializeItem>[];
  itemCount: number;
}

function serializeItem(item: WishlistItemRow) {
  const { product, variant } = item;

  return {
    id: item.id,
    productId: product.id,
    variantId: variant?.id ?? null,
    name: product.name,
    slug: product.slug,
    sku: product.sku,
    variantName: variant?.name ?? null,
    imageUrl: product.images[0]?.url ?? null,
    brand: product.brand,
    ratingAverage: product.ratingAverage,
    reviewCount: product.reviewCount,
    ...buildPriceView(product.price, product.discountPrice),
    ...buildStockView(variant ? variant.inventory : product.inventory),
    // A wishlist keeps showing removed products, flagged — silently dropping a saved
    // item is more confusing than telling the customer it went away.
    isPurchasable: product.status === 'ACTIVE' && product.deletedAt === null,
    addedAt: item.createdAt,
  };
}

export const wishlistService = {
  async get(userId: string): Promise<WishlistView> {
    const wishlist = await wishlistRepository.findOrCreateByUserId(userId);
    return {
      id: wishlist.id,
      items: wishlist.items.map(serializeItem),
      itemCount: wishlist.items.length,
    };
  },

  async add(userId: string, productId: string, variantId: string | null = null) {
    const product = await prisma.product.findFirst({ where: { id: productId, deletedAt: null } });
    if (!product) throw ApiError.notFound('Product not found', ErrorCode.PRODUCT_NOT_FOUND);

    if (variantId) {
      const variant = await prisma.productVariant.findUnique({ where: { id: variantId } });
      if (!variant || variant.productId !== productId) {
        throw ApiError.notFound('Product option not found', ErrorCode.VARIANT_NOT_FOUND);
      }
    }

    const wishlist = await wishlistRepository.findOrCreateByUserId(userId);
    const existing = await wishlistRepository.findItem(wishlist.id, productId, variantId);

    // Idempotent: saving twice is a no-op, not a 409. The heart icon is a toggle and
    // a double-tap should not surface an error.
    if (!existing) {
      await wishlistRepository.createItem({ wishlistId: wishlist.id, productId, variantId });
    }

    return this.get(userId);
  },

  async remove(userId: string, productId: string) {
    const wishlist = await wishlistRepository.findOrCreateByUserId(userId);
    const removed = await wishlistRepository.deleteByProduct(wishlist.id, productId);

    if (removed.count === 0) {
      throw ApiError.notFound('That item is not in your wishlist');
    }

    return this.get(userId);
  },

  async clear(userId: string) {
    const wishlist = await wishlistRepository.findOrCreateByUserId(userId);
    await wishlistRepository.clear(wishlist.id);
    return this.get(userId);
  },

  /**
   * Moves an item to the cart. `cartService.addItem` re-runs every availability and
   * stock rule, so this cannot become a back door around them.
   */
  async moveToCart(
    userId: string,
    productId: string,
    variantId: string | null,
    quantity = 1,
  ): Promise<{ cart: CartView; wishlist: WishlistView }> {
    const wishlist = await wishlistRepository.findOrCreateByUserId(userId);
    const item = await wishlistRepository.findItem(wishlist.id, productId, variantId);
    if (!item) throw ApiError.notFound('That item is not in your wishlist');

    const cart = await cartService.addItem(userId, {
      productId,
      variantId: variantId ?? undefined,
      quantity,
    });

    // Only remove after the add succeeds — a failed add must not lose the saved item.
    await wishlistRepository.deleteItem(item.id);

    return { cart, wishlist: await this.get(userId) };
  },

  productIds(userId: string): Promise<string[]> {
    return wishlistRepository.productIdsForUser(userId);
  },
};
