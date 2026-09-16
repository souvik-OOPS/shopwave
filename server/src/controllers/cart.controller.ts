import type { Request, Response } from 'express';

import { addressService } from '@/services/address.service';
import { cartService } from '@/services/cart.service';
import { wishlistService } from '@/services/wishlist.service';
import type { CreateAddressInput, UpdateAddressInput } from '@/schemas/address.schema';
import type { AddToCartInput, CartQuery, UpdateCartItemInput } from '@/schemas/cart.schema';
import { asyncHandler } from '@/utils/asyncHandler';
import { sendCreated, sendNoContent, sendSuccess } from '@/utils/response';
import type { AuthenticatedRequest } from '@/types';

export const cartController = {
  get: asyncHandler(async (req: Request, res: Response) => {
    const { user } = req as AuthenticatedRequest;
    const { couponCode } = req.query as CartQuery;
    const cart = await cartService.getCart(user.id, couponCode);
    return sendSuccess(res, { cart });
  }),

  addItem: asyncHandler(async (req: Request, res: Response) => {
    const { user } = req as AuthenticatedRequest;
    const cart = await cartService.addItem(user.id, req.body as AddToCartInput);
    return sendCreated(res, { cart }, 'Added to cart');
  }),

  updateItem: asyncHandler(async (req: Request, res: Response) => {
    const { user } = req as AuthenticatedRequest;
    const { quantity } = req.body as UpdateCartItemInput;
    const cart = await cartService.updateItem(user.id, req.params.id, quantity);
    return sendSuccess(res, { cart }, { message: 'Cart updated' });
  }),

  removeItem: asyncHandler(async (req: Request, res: Response) => {
    const { user } = req as AuthenticatedRequest;
    const cart = await cartService.removeItem(user.id, req.params.id);
    return sendSuccess(res, { cart }, { message: 'Item removed' });
  }),

  clear: asyncHandler(async (req: Request, res: Response) => {
    const { user } = req as AuthenticatedRequest;
    const cart = await cartService.clear(user.id);
    return sendSuccess(res, { cart }, { message: 'Cart cleared' });
  }),

  /** Drops sold-out lines and clamps quantities — called on entering checkout. */
  reconcile: asyncHandler(async (req: Request, res: Response) => {
    const { user } = req as AuthenticatedRequest;
    const cart = await cartService.reconcile(user.id);
    return sendSuccess(res, { cart });
  }),
};

export const wishlistController = {
  get: asyncHandler(async (req: Request, res: Response) => {
    const { user } = req as AuthenticatedRequest;
    const wishlist = await wishlistService.get(user.id);
    return sendSuccess(res, { wishlist });
  }),

  ids: asyncHandler(async (req: Request, res: Response) => {
    const { user } = req as AuthenticatedRequest;
    const productIds = await wishlistService.productIds(user.id);
    return sendSuccess(res, { productIds });
  }),

  add: asyncHandler(async (req: Request, res: Response) => {
    const { user } = req as AuthenticatedRequest;
    const body = req.body as { variantId?: string | null } | undefined;
    const wishlist = await wishlistService.add(
      user.id,
      req.params.productId,
      body?.variantId ?? null,
    );
    return sendCreated(res, { wishlist }, 'Saved to wishlist');
  }),

  remove: asyncHandler(async (req: Request, res: Response) => {
    const { user } = req as AuthenticatedRequest;
    const wishlist = await wishlistService.remove(user.id, req.params.productId);
    return sendSuccess(res, { wishlist }, { message: 'Removed from wishlist' });
  }),

  clear: asyncHandler(async (req: Request, res: Response) => {
    const { user } = req as AuthenticatedRequest;
    const wishlist = await wishlistService.clear(user.id);
    return sendSuccess(res, { wishlist }, { message: 'Wishlist cleared' });
  }),

  moveToCart: asyncHandler(async (req: Request, res: Response) => {
    const { user } = req as AuthenticatedRequest;
    const body = req.body as { variantId?: string | null; quantity?: number } | undefined;
    const result = await wishlistService.moveToCart(
      user.id,
      req.params.productId,
      body?.variantId ?? null,
      body?.quantity ?? 1,
    );
    return sendSuccess(res, result, { message: 'Moved to cart' });
  }),
};

export const addressController = {
  list: asyncHandler(async (req: Request, res: Response) => {
    const { user } = req as AuthenticatedRequest;
    const addresses = await addressService.list(user.id);
    return sendSuccess(res, { addresses });
  }),

  get: asyncHandler(async (req: Request, res: Response) => {
    const { user } = req as AuthenticatedRequest;
    const address = await addressService.get(user.id, req.params.id);
    return sendSuccess(res, { address });
  }),

  create: asyncHandler(async (req: Request, res: Response) => {
    const { user } = req as AuthenticatedRequest;
    const address = await addressService.create(user.id, req.body as CreateAddressInput);
    return sendCreated(res, { address }, 'Address saved');
  }),

  update: asyncHandler(async (req: Request, res: Response) => {
    const { user } = req as AuthenticatedRequest;
    const address = await addressService.update(
      user.id,
      req.params.id,
      req.body as UpdateAddressInput,
    );
    return sendSuccess(res, { address }, { message: 'Address updated' });
  }),

  remove: asyncHandler(async (req: Request, res: Response) => {
    const { user } = req as AuthenticatedRequest;
    await addressService.remove(user.id, req.params.id);
    return sendNoContent(res);
  }),

  setDefault: asyncHandler(async (req: Request, res: Response) => {
    const { user } = req as AuthenticatedRequest;
    const address = await addressService.setDefault(user.id, req.params.id);
    return sendSuccess(res, { address }, { message: 'Default address updated' });
  }),
};
