import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useAppDispatch, useAppSelector } from '@/app/store';
import { syncFromServer } from '@/features/cart/cartSlice';
import { optimisticToggle, syncWishlist } from '@/features/wishlist/wishlistSlice';
import { wishlistApi } from '@/lib/api';
import { queryKeys } from '@/lib/queryClient';
import { useToast } from '@/hooks/useToast';

export function useWishlist() {
  const isAuthenticated = useAppSelector((state) => state.auth.status === 'authenticated');

  return useQuery({
    queryKey: queryKeys.wishlist.all,
    queryFn: async () => {
      const { wishlist } = await wishlistApi.get();
      return wishlist;
    },
    enabled: isAuthenticated,
  });
}

/** Keeps the saved-product id set in Redux so every card can render its heart state. */
export function useWishlistSync() {
  const dispatch = useAppDispatch();
  const isAuthenticated = useAppSelector((state) => state.auth.status === 'authenticated');

  const query = useQuery({
    queryKey: queryKeys.wishlist.ids,
    queryFn: () => wishlistApi.ids(),
    enabled: isAuthenticated,
    staleTime: 5 * 60_000,
  });

  useEffect(() => {
    if (query.data) dispatch(syncWishlist(query.data.productIds));
  }, [query.data, dispatch]);
}

export interface ToggleWishlistInput {
  productId: string;
  /** The heart's state as the user saw it when they clicked. */
  isSaved: boolean;
}

/**
 * A heart icon must feel instant, so the toggle flips local state first and reconciles
 * afterwards. On failure the flip is undone — the icon never silently disagrees with
 * what was actually saved.
 *
 * `isSaved` is a mutation *variable* rather than something `mutationFn` reads back out of
 * the store, and that is load-bearing. React Query re-points a running mutation at the
 * latest render's options, and `onMutate` is awaited before `mutationFn` runs — so a
 * `mutationFn` closing over `state.wishlist.productIds` can observe the optimistic flip
 * that `onMutate` just made and send exactly the opposite request: a DELETE for an item
 * that was never added, answered with "That item is not in your wishlist". Whether the
 * re-render lands inside that window is a race, which is why it only failed sometimes.
 */
export function useToggleWishlist() {
  const dispatch = useAppDispatch();
  const toast = useToast();
  const client = useQueryClient();

  return useMutation({
    mutationFn: ({ productId, isSaved }: ToggleWishlistInput) =>
      isSaved ? wishlistApi.remove(productId) : wishlistApi.add(productId),

    onMutate: ({ productId }) => {
      dispatch(optimisticToggle(productId));
    },

    onSuccess: ({ wishlist }, { isSaved }) => {
      client.setQueryData(queryKeys.wishlist.all, wishlist);
      dispatch(syncWishlist(wishlist.items.map((item) => item.productId)));
      toast.success(isSaved ? 'Removed from wishlist' : 'Saved to wishlist');
    },

    onError: (error, { productId }) => {
      // Undo the optimistic flip: `optimisticToggle` is its own inverse.
      dispatch(optimisticToggle(productId));
      toast.error(error);
    },
  });
}

export function useMoveWishlistItemToCart() {
  const dispatch = useAppDispatch();
  const toast = useToast();
  const client = useQueryClient();

  return useMutation({
    mutationFn: ({
      productId,
      variantId,
      quantity,
    }: {
      productId: string;
      variantId?: string | null;
      quantity?: number;
    }) => wishlistApi.moveToCart(productId, { variantId, quantity }),

    onSuccess: ({ cart, wishlist }) => {
      client.setQueryData(queryKeys.cartWithCoupon(null), cart);
      void client.invalidateQueries({
        queryKey: queryKeys.cart,
        predicate: (query) => query.queryKey[1] != null,
      });
      client.setQueryData(queryKeys.wishlist.all, wishlist);
      dispatch(syncFromServer(cart));
      dispatch(syncWishlist(wishlist.items.map((item) => item.productId)));
      toast.success('Moved to cart');
    },

    onError: (error) => toast.error(error),
  });
}
