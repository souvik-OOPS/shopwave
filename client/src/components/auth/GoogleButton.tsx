import { useState } from 'react';

import { Button } from '@/components/ui/Button';
import { API_BASE_URL } from '@/lib/apiClient';

/** Google's brand mark. Inline because lucide has no Google icon and the colours are fixed. */
function GoogleMark() {
  return (
    <svg viewBox="0 0 48 48" className="h-[18px] w-[18px] shrink-0" aria-hidden="true" focusable="false">
      <path
        fill="#4285F4"
        d="M45.12 24.5c0-1.56-.14-3.06-.4-4.5H24v8.51h11.84c-.51 2.75-2.06 5.08-4.39 6.64v5.52h7.11c4.16-3.83 6.56-9.47 6.56-16.17z"
      />
      <path
        fill="#34A853"
        d="M24 46c5.94 0 10.92-1.97 14.56-5.33l-7.11-5.52c-1.97 1.32-4.49 2.1-7.45 2.1-5.73 0-10.58-3.87-12.31-9.07H4.34v5.7C7.96 41.07 15.4 46 24 46z"
      />
      <path
        fill="#FBBC05"
        d="M11.69 28.18c-.44-1.32-.69-2.73-.69-4.18s.25-2.86.69-4.18v-5.7H4.34A21.99 21.99 0 0 0 2 24c0 3.55.85 6.91 2.34 9.88l7.35-5.7z"
      />
      <path
        fill="#EA4335"
        d="M24 10.75c3.23 0 6.13 1.11 8.41 3.29l6.31-6.31C34.91 4.18 29.93 2 24 2 15.4 2 7.96 6.93 4.34 14.12l7.35 5.7c1.73-5.2 6.58-9.07 12.31-9.07z"
      />
    </svg>
  );
}

interface GoogleButtonProps {
  label?: string;
  /** In-app path to land on afterwards. Re-validated server side — never trusted from here. */
  redirectTo?: string;
}

/**
 * Hands the browser over to the API, which redirects on to Google's consent screen.
 *
 * This is a full-page navigation rather than an XHR on purpose: the flow ends with the
 * API setting the same HTTP-only session cookies a password login sets, and a fetch
 * cannot follow a cross-origin redirect chain to collect them. The app reboots on the
 * way back and `bootstrapSession` picks the session up from `/auth/me`.
 */
export function GoogleButton({ label = 'Continue with Google', redirectTo = '/' }: GoogleButtonProps) {
  // Survives only until the page unloads a moment later; it stops a double click from
  // starting a second handshake and invalidating the first one's state cookie.
  const [leaving, setLeaving] = useState(false);

  function start() {
    setLeaving(true);
    window.location.assign(`${API_BASE_URL}/auth/google?redirect=${encodeURIComponent(redirectTo)}`);
  }

  return (
    <Button
      type="button"
      variant="outline"
      size="lg"
      fullWidth
      loading={leaving}
      onClick={start}
      leftIcon={<GoogleMark />}
    >
      {label}
    </Button>
  );
}

/** "or" rule between the provider button and the credential form. */
export function AuthDivider({ label = 'or' }: { label?: string }) {
  return (
    <div className="my-6 flex items-center gap-3" role="separator">
      <span className="h-px flex-1 bg-ink-200" />
      <span className="text-xs font-medium uppercase tracking-wide text-ink-400">{label}</span>
      <span className="h-px flex-1 bg-ink-200" />
    </div>
  );
}
