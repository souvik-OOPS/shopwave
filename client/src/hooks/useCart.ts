import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useAppDispatch, useAppSelector } from '@/app/store';
import { optimisticAdd, rollbackOptimistic, syncFromServer } from '@/features/cart/cartSlice';
import { openCartDrawer } from '@/features/ui/uiSlice';
import { cartApi } from '@/lib/api';
import { queryClient, queryKeys } from '@/lib/queryClient';
import { useToast } from '@/hooks/useToast';
import type { Cart } from '@/types/api';

/**
 * The cart query. The server recomputes prices and availability on every read, so this
 * is intentionally short-lived: a stale cart showing an old price is worse than a refetch.
 */
export function useCart(couponCode?: string | null) {
  const dispatch = useAppDispatch();
  const isAuthenticated = useAppSelector((state) => state.auth.status === 'authenticated');

  const query = useQuery({
    queryKey: queryKeys.cartWithCoupon(couponCode),
    queryFn: async () => {
      const { cart } = await cartApi.get(couponCode);
      return cart;
    },
    enabled: isAuthenticated,
    staleTime: 15_000,
  });

  // Mirror the server totals into Redux so the header badge stays in step.
  useEffect(() => {
    if (query.data) dispatch(syncFromServer(query.data));
  }, [query.data, dispatch]);

  return query;
}

/**
 * Mutations answer with the plain cart, so that is the entry they refresh directly —
 * instantly, because the header badge reads it. Any coupon-priced view of the same cart
 * is a different entry whose totals only the server can recompute, so it is marked stale
 * and refetched rather than patched with numbers that no longer include the discount.
 */
function setCart(cart: Cart) {
  queryClient.setQueryData(queryKeys.cartWithCoupon(null), cart);
  void queryClient.invalidateQueries({
    queryKey: queryKeys.cart,
    predicate: (query) => query.queryKey[1] != null,
  });
}

export function useAddToCart() {
  const dispatch = useAppDispatch();
  const toast = useToast();

  return useMutation({
    mutationFn: (payload: { productId: string; variantId?: string | null; quantity: number }) =>
      cartApi.addItem(payload),

    // Bump the badge immediately; the request usually resolves before the eye notices.
    onMutate: (payload) => {
      dispatch(optimisticAdd({ quantity: payload.quantity }));
      return { quantity: payload.quantity };
    },

    onSuccess: ({ cart }) => {
      setCart(cart);
      dispatch(syncFromServer(cart));
      dispatch(openCartDrawer());
    },

    onError: (error, _payload, context) => {
      // Roll the optimistic count back so the badge never lies about a failed add.
      if (context) dispatch(rollbackOptimistic({ quantity: context.quantity }));
      toast.error(error);
    },
  });
}

export function useUpdateCartItem() {
  const dispatch = useAppDispatch();
  const toast = useToast();
  const client = useQueryClient();

  return useMutation({
    mutationFn: ({ itemId, quantity }: { itemId: string; quantity: number }) =>
      cartApi.updateItem(itemId, quantity),

    onSuccess: ({ cart }) => {
      setCart(cart);
      dispatch(syncFromServer(cart));
    },

    onError: (error) => {
      toast.error(error);
      // The optimistic guess is gone — pull the truth back from the server.
      void client.invalidateQueries({ queryKey: queryKeys.cart });
    },
  });
}

export function useRemoveCartItem() {
  const dispatch = useAppDispatch();
  const toast = useToast();

  return useMutation({
    mutationFn: (itemId: string) => cartApi.removeItem(itemId),
    onSuccess: ({ cart }) => {
      setCart(cart);
      dispatch(syncFromServer(cart));
      toast.info('Removed from cart');
    },
    onError: (error) => toast.error(error),
  });
}

export function useClearCart() {
  const dispatch = useAppDispatch();
  const toast = useToast();

  return useMutation({
    mutationFn: () => cartApi.clear(),
    onSuccess: ({ cart }) => {
      setCart(cart);
      dispatch(syncFromServer(cart));
      toast.info('Cart cleared');
    },
    onError: (error) => toast.error(error),
  });
}
