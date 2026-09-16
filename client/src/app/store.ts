import { configureStore } from '@reduxjs/toolkit';
import { useDispatch, useSelector, type TypedUseSelectorHook } from 'react-redux';

import authReducer, { sessionExpired } from '@/features/auth/authSlice';
import cartReducer from '@/features/cart/cartSlice';
import themeReducer from '@/features/theme/themeSlice';
import uiReducer from '@/features/ui/uiSlice';
import wishlistReducer from '@/features/wishlist/wishlistSlice';
import { setAuthFailureHandler } from '@/lib/apiClient';

export const store = configureStore({
  reducer: {
    auth: authReducer,
    cart: cartReducer,
    wishlist: wishlistReducer,
    ui: uiReducer,
    theme: themeReducer,
  },
  devTools: import.meta.env.DEV,
});

/**
 * Closes the loop between the HTTP layer and the store: when a token refresh finally
 * fails, the interceptor clears the session so route guards react immediately rather
 * than waiting for the next render to notice.
 */
setAuthFailureHandler(() => {
  store.dispatch(sessionExpired());
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;

/** Pre-typed hooks — components never re-annotate `RootState`. */
export const useAppDispatch: () => AppDispatch = useDispatch;
export const useAppSelector: TypedUseSelectorHook<RootState> = useSelector;
