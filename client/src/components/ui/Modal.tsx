import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/utils';

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  /** Drawers slide in from the right; used for the cart and mobile filters. */
  variant?: 'dialog' | 'drawer';
}

const SIZES = {
  sm: 'max-w-sm',
  md: 'max-w-lg',
  lg: 'max-w-2xl',
  xl: 'max-w-4xl',
};

/**
 * Accessible overlay: Escape closes, focus moves inside on open and returns to the
 * trigger on close, and background scroll is locked. Without focus management a modal
 * is a visual illusion — keyboard users stay on the page behind it.
 */
export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = 'md',
  variant = 'dialog',
}: ModalProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return undefined;

    previouslyFocused.current = document.activeElement as HTMLElement | null;

    const { overflow } = document.body.style;
    document.body.style.overflow = 'hidden';

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        onClose();
        return;
      }

      // Trap Tab within the panel so focus cannot escape to the inert page behind.
      if (event.key === 'Tab' && panelRef.current) {
        const focusable = panelRef.current.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])',
        );
        if (focusable.length === 0) return;

        const first = focusable[0]!;
        const last = focusable[focusable.length - 1]!;

        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    // Defer so the panel exists before we try to focus into it. Prefer an explicitly
    // marked target, otherwise fall back to the panel itself.
    const focusTimer = window.setTimeout(() => {
      const autofocusTarget = panelRef.current?.querySelector<HTMLElement>('[data-autofocus]');
      if (autofocusTarget) {
        autofocusTarget.focus();
      } else {
        panelRef.current?.focus();
      }
    }, 0);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      window.clearTimeout(focusTimer);
      document.body.style.overflow = overflow;
      previouslyFocused.current?.focus();
    };
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex" role="presentation">
      <div
        // Literal slate: a scrim has to darken the page in both themes, never lighten it.
        className="fixed inset-0 animate-fade-in bg-slate-950/50 backdrop-blur-[2px] dark:bg-slate-950/70"
        onClick={onClose}
        aria-hidden="true"
      />

      <div
        className={cn(
          'relative z-10 flex w-full',
          variant === 'drawer' ? 'ml-auto h-full' : 'items-center justify-center p-4',
        )}
      >
        <div
          ref={panelRef}
          role="dialog"
          aria-modal="true"
          aria-label={title}
          tabIndex={-1}
          className={cn(
            'flex w-full flex-col bg-surface-raised shadow-popover focus:outline-none',
            variant === 'drawer'
              ? 'h-full max-w-md animate-slide-in-right'
              : cn('max-h-[90vh] animate-slide-up rounded-2xl', SIZES[size]),
          )}
        >
          {(title || variant === 'drawer') && (
            <header className="flex items-start justify-between gap-4 border-b border-ink-200 px-5 py-4">
              <div className="min-w-0">
                {title && <h2 className="text-base font-semibold text-ink-900">{title}</h2>}
                {description && <p className="mt-0.5 text-sm text-ink-500">{description}</p>}
              </div>
              <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close">
                <X className="h-5 w-5" aria-hidden="true" />
              </Button>
            </header>
          )}

          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">{children}</div>

          {footer && <footer className="border-t border-ink-200 px-5 py-4">{footer}</footer>}
        </div>
      </div>
    </div>,
    document.body,
  );
}

export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'danger' | 'default';
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/** Used for anything destructive — deleting an address, cancelling an order. */
export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant = 'default',
  loading = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  return (
    <Modal
      open={open}
      onClose={onCancel}
      title={title}
      size="sm"
      footer={
        <div className="flex justify-end gap-3">
          <Button variant="outline" onClick={onCancel} disabled={loading}>
            {cancelLabel}
          </Button>
          <Button
            variant={variant === 'danger' ? 'danger' : 'primary'}
            onClick={onConfirm}
            loading={loading}
            data-autofocus
          >
            {confirmLabel}
          </Button>
        </div>
      }
    >
      <p className="text-sm leading-relaxed text-ink-600">{description}</p>
    </Modal>
  );
}
