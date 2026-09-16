import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from 'lucide-react';

import { useAppDispatch, useAppSelector } from '@/app/store';
import { dismissToast, type Toast, type ToastVariant } from '@/features/ui/uiSlice';
import { cn } from '@/lib/utils';

const VARIANT_STYLES: Record<ToastVariant, { wrapper: string; icon: JSX.Element }> = {
  success: {
    wrapper: 'border-success-500/30 bg-success-50',
    icon: <CheckCircle2 className="h-5 w-5 text-success-600" aria-hidden="true" />,
  },
  error: {
    wrapper: 'border-danger-500/30 bg-danger-50',
    icon: <XCircle className="h-5 w-5 text-danger-600" aria-hidden="true" />,
  },
  warning: {
    wrapper: 'border-warning-500/30 bg-warning-50',
    icon: <AlertTriangle className="h-5 w-5 text-warning-600" aria-hidden="true" />,
  },
  info: {
    wrapper: 'border-ink-200 bg-surface-raised',
    icon: <Info className="h-5 w-5 text-brand-600" aria-hidden="true" />,
  },
};

function ToastCard({ toast }: { toast: Toast }) {
  const dispatch = useAppDispatch();
  const styles = VARIANT_STYLES[toast.variant];

  useEffect(() => {
    const timer = window.setTimeout(() => dispatch(dismissToast(toast.id)), toast.duration);
    return () => window.clearTimeout(timer);
  }, [dispatch, toast.id, toast.duration]);

  return (
    <div
      className={cn(
        'pointer-events-auto flex w-full items-start gap-3 rounded-xl border p-4 shadow-popover',
        'animate-toast-in',
        styles.wrapper,
      )}
    >
      <span className="mt-0.5 shrink-0">{styles.icon}</span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-ink-900">{toast.title}</p>
        {toast.description && <p className="mt-0.5 text-sm text-ink-600">{toast.description}</p>}
      </div>
      <button
        type="button"
        onClick={() => dispatch(dismissToast(toast.id))}
        aria-label="Dismiss notification"
        className="shrink-0 rounded-md p-0.5 text-ink-400 transition-colors hover:bg-ink-200/60 hover:text-ink-700"
      >
        <X className="h-4 w-4" aria-hidden="true" />
      </button>
    </div>
  );
}

/**
 * Toast host. `aria-live="polite"` means a screen reader announces new messages without
 * interrupting whatever the user is doing — `assertive` here would be hostile.
 */
export function Toaster() {
  const toasts = useAppSelector((state) => state.ui.toasts);

  return createPortal(
    <div
      aria-live="polite"
      aria-atomic="false"
      className="pointer-events-none fixed inset-x-0 top-4 z-[60] mx-auto flex w-full max-w-sm flex-col gap-2 px-4 sm:left-auto sm:right-4 sm:mx-0 sm:px-0"
    >
      {toasts.map((toast) => (
        <ToastCard key={toast.id} toast={toast} />
      ))}
    </div>,
    document.body,
  );
}
