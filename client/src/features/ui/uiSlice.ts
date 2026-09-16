import { createSlice, nanoid, type PayloadAction } from '@reduxjs/toolkit';

export type ToastVariant = 'success' | 'error' | 'info' | 'warning';

export interface Toast {
  id: string;
  variant: ToastVariant;
  title: string;
  description?: string;
  duration: number;
}

export interface ConfirmDialogState {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  cancelLabel: string;
  variant: 'danger' | 'default';
  /** Identifies which action the confirmation belongs to when it resolves. */
  actionId: string | null;
}

/**
 * Global UI chrome only: overlays that can be triggered from anywhere (a toast raised by
 * a mutation deep in a page, the cart drawer opened from the header). Component-local
 * state — form fields, dropdown open/closed — deliberately stays in `useState`.
 */
interface UiState {
  toasts: Toast[];
  cartDrawerOpen: boolean;
  mobileNavOpen: boolean;
  searchOpen: boolean;
  filtersOpen: boolean;
  confirmDialog: ConfirmDialogState;
}

const initialConfirmDialog: ConfirmDialogState = {
  open: false,
  title: '',
  description: '',
  confirmLabel: 'Confirm',
  cancelLabel: 'Cancel',
  variant: 'default',
  actionId: null,
};

const initialState: UiState = {
  toasts: [],
  cartDrawerOpen: false,
  mobileNavOpen: false,
  searchOpen: false,
  filtersOpen: false,
  confirmDialog: initialConfirmDialog,
};

const uiSlice = createSlice({
  name: 'ui',
  initialState,
  reducers: {
    showToast: {
      reducer(state, action: PayloadAction<Toast>) {
        // Cap the stack so a burst of failures cannot bury the screen.
        state.toasts = [...state.toasts, action.payload].slice(-4);
      },
      prepare(payload: { variant?: ToastVariant; title: string; description?: string; duration?: number }) {
        return {
          payload: {
            id: nanoid(),
            variant: payload.variant ?? 'info',
            title: payload.title,
            description: payload.description,
            duration: payload.duration ?? 4500,
          },
        };
      },
    },
    dismissToast(state, action: PayloadAction<string>) {
      state.toasts = state.toasts.filter((toast) => toast.id !== action.payload);
    },
    clearToasts(state) {
      state.toasts = [];
    },

    openCartDrawer(state) {
      state.cartDrawerOpen = true;
    },
    closeCartDrawer(state) {
      state.cartDrawerOpen = false;
    },
    toggleCartDrawer(state) {
      state.cartDrawerOpen = !state.cartDrawerOpen;
    },

    setMobileNavOpen(state, action: PayloadAction<boolean>) {
      state.mobileNavOpen = action.payload;
    },
    setSearchOpen(state, action: PayloadAction<boolean>) {
      state.searchOpen = action.payload;
    },
    setFiltersOpen(state, action: PayloadAction<boolean>) {
      state.filtersOpen = action.payload;
    },

    openConfirmDialog(
      state,
      action: PayloadAction<{
        title: string;
        description: string;
        confirmLabel?: string;
        cancelLabel?: string;
        variant?: 'danger' | 'default';
        actionId: string;
      }>,
    ) {
      state.confirmDialog = {
        open: true,
        title: action.payload.title,
        description: action.payload.description,
        confirmLabel: action.payload.confirmLabel ?? 'Confirm',
        cancelLabel: action.payload.cancelLabel ?? 'Cancel',
        variant: action.payload.variant ?? 'default',
        actionId: action.payload.actionId,
      };
    },
    closeConfirmDialog(state) {
      state.confirmDialog = initialConfirmDialog;
    },

    /** Route changes close every transient overlay in one go. */
    closeAllOverlays(state) {
      state.cartDrawerOpen = false;
      state.mobileNavOpen = false;
      state.searchOpen = false;
      state.filtersOpen = false;
    },
  },
});

export const {
  showToast,
  dismissToast,
  clearToasts,
  openCartDrawer,
  closeCartDrawer,
  toggleCartDrawer,
  setMobileNavOpen,
  setSearchOpen,
  setFiltersOpen,
  openConfirmDialog,
  closeConfirmDialog,
  closeAllOverlays,
} = uiSlice.actions;

export default uiSlice.reducer;
