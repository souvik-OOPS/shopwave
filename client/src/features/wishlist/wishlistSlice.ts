import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

/**
 * Just the set of saved product ids. Every product card needs to know "is this
 * wishlisted?" — holding the ids here means one lookup per card instead of one request,
 * and lets the heart toggle respond instantly before the server confirms.
 */
interface WishlistState {
  productIds: string[];
  count: number;
}

const initialState: WishlistState = {
  productIds: [],
  count: 0,
};

const wishlistSlice = createSlice({
  name: 'wishlist',
  initialState,
  reducers: {
    syncFromServer(state, action: PayloadAction<string[]>) {
      state.productIds = action.payload;
      state.count = action.payload.length;
    },
    optimisticToggle(state, action: PayloadAction<string>) {
      const productId = action.payload;
      state.productIds = state.productIds.includes(productId)
        ? state.productIds.filter((id) => id !== productId)
        : [...state.productIds, productId];
      state.count = state.productIds.length;
    },
    reset() {
      return initialState;
    },
  },
});

export const {
  syncFromServer: syncWishlist,
  optimisticToggle,
  reset: resetWishlist,
} = wishlistSlice.actions;

export default wishlistSlice.reducer;
