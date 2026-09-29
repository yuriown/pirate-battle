import type { ReactNode } from 'react';

import { icon } from '../ui/icons';

export function LoadingState({ label }: { label: string }) {
  return (
    <div className="pb-status" role="status" aria-live="polite">
      {label}
    </div>
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return (
    <div className="pb-status" role="status">
      {children}
    </div>
  );
}

export function ErrorState({ message, onRetry, retrying }: { message: string; onRetry: () => void; retrying: boolean }) {
  return (
    <div className="pb-error" role="alert">
      <p>{message}</p>
      {/* aria-disabled (not disabled) so keyboard focus stays on the button while retrying. */}
      <button
        type="button"
        className="pb-btn pb-btn--secondary"
        onClick={() => !retrying && onRetry()}
        aria-disabled={retrying}
      >
        {retrying ? 'Retrying…' : 'Retry'}
      </button>
    </div>
  );
}

/** Background refresh while cached rows stay on screen. */
export function UpdatingIndicator({ active }: { active: boolean }) {
  if (!active) return null;
  return (
    <span className="pb-status" role="status" aria-live="polite">
      Updating…
    </span>
  );
}

interface PagerProps {
  page: number;
  totalPages: number;
  onChange: (page: number) => void;
  label: string;
}

export function Pager({ page, totalPages, onChange, label }: PagerProps) {
  return (
    <nav className="flex items-center justify-center gap-4" aria-label={`${label} pages`}>
      <button
        type="button"
        className="pb-round-btn"
        aria-label="Previous page"
        disabled={page <= 1}
        onClick={() => onChange(page - 1)}
      >
        <img src={icon.turnLeft} alt="" />
      </button>
      <span className="text-amber-50" aria-live="polite">
        Page {page} of {totalPages}
      </span>
      <button
        type="button"
        className="pb-round-btn"
        aria-label="Next page"
        disabled={page >= totalPages}
        onClick={() => onChange(page + 1)}
      >
        <img src={icon.turnRight} alt="" />
      </button>
    </nav>
  );
}
