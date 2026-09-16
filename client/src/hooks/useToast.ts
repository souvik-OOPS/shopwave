import { useCallback } from 'react';

import { useAppDispatch } from '@/app/store';
import { showToast } from '@/features/ui/uiSlice';
import { ApiRequestError } from '@/lib/apiClient';

/**
 * Thin wrapper over the UI slice. `error()` understands ApiRequestError, so mutation
 * handlers can pass the raw error and get a sensible message without unwrapping it.
 */
export function useToast() {
  const dispatch = useAppDispatch();

  const success = useCallback(
    (title: string, description?: string) => {
      dispatch(showToast({ variant: 'success', title, description }));
    },
    [dispatch],
  );

  const error = useCallback(
    (titleOrError: string | unknown, description?: string) => {
      if (typeof titleOrError === 'string') {
        dispatch(showToast({ variant: 'error', title: titleOrError, description }));
        return;
      }

      const message =
        titleOrError instanceof ApiRequestError
          ? titleOrError.message
          : 'Something went wrong. Please try again.';

      dispatch(showToast({ variant: 'error', title: message, description }));
    },
    [dispatch],
  );

  const info = useCallback(
    (title: string, description?: string) => {
      dispatch(showToast({ variant: 'info', title, description }));
    },
    [dispatch],
  );

  const warning = useCallback(
    (title: string, description?: string) => {
      dispatch(showToast({ variant: 'warning', title, description }));
    },
    [dispatch],
  );

  return { success, error, info, warning };
}
