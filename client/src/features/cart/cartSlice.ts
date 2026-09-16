import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

import type { Cart } from '@/types/api';

/**
 * React Query owns the authoritative cart. This slice holds only the derived counters
 * the header badge needs, mirrored here so the badge re-renders instantly on an
 * optimistic update without every consumer subscribing to the full cart query.
 *
 * The server remains the source of truth: `syncFromServer` overwrites whatever the
 * optimistic path guessed.
 */
interface CartState {
  itemCount: number;
  totalQuantity: number;
  subtotal: number;
  /** Set while a mutation is in flight so the badge can show a subtle pulse. */
  pending: boolean;
  lastSyncedAt: number | null;
}

const initialState: CartState = {
  itemCount: 0,
  totalQuantity: 0,
  subtotal: 0,
  pending: false,
  lastSyncedAt: null,
};

const cartSlice = createSlice({
  name: 'cart',
  initialState,
  reducers: {
    syncFromServer(state, action: PayloadAction<Cart>) {
      const { summary } = action.payload;
      state.itemCount = summary.itemCount;
      state.totalQuantity = summary.totalQuantity;
      state.subtotal = summary.subtotal;
      state.pending = false;
      state.lastSyncedAt = Date.now();
    },

    /**
     * Optimistic bump for the header badge. Always followed by `syncFromServer` (on
     * success) or `rollbackOptimistic` (on failure), so a rejected add never leaves a
     * phantom item in the count.
     */
    optimisticAdd(state, action: PayloadAction<{ quantity: number }>) {
      state.totalQuantity += action.payload.quantity;
      state.pending = true;
    },
    rollbackOptimistic(state, action: PayloadAction<{ quantity: number }>) {
      state.totalQuantity = Math.max(0, state.totalQuantity - action.payload.quantity);
      state.pending = false;
    },
    setPending(state, action: PayloadAction<boolean>) {
      state.pending = action.payload;
    },
    reset() {
      return initialState;
    },
  },
});

export const { syncFromServer, optimisticAdd, rollbackOptimistic, setPending, reset: resetCart } =
  cartSlice.actions;

export default cartSlice.reducer;
