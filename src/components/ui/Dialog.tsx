import { useEffect, useRef, type ReactNode } from 'react';

interface DialogProps {
  labelledBy: string;
  describedBy?: string;
  onEscape?: () => void;
  /** Extra keyboard shortcuts handled while the dialog has focus, keyed by KeyboardEvent.code. */
  shortcuts?: Record<string, () => void>;
  children: ReactNode;
  className?: string;
  /** Element to focus first (defaults to the first focusable element). */
  initialFocus?: React.RefObject<HTMLElement>;
  testId?: string;
}

const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Modal dialog with a focus trap: focus moves inside on open, Tab cycles within, Escape calls
 * `onEscape`, and focus returns to the previously focused element on close.
 */
export function Dialog({ labelledBy, describedBy, onEscape, shortcuts, children, className = '', initialFocus, testId }: DialogProps) {
  const ref = useRef<HTMLDivElement>(null);
  const onEscapeRef = useRef(onEscape);
  onEscapeRef.current = onEscape;
  const shortcutsRef = useRef(shortcuts);
  shortcutsRef.current = shortcuts;

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const previous = document.activeElement as HTMLElement | null;
    const first = initialFocus?.current ?? node.querySelector<HTMLElement>(FOCUSABLE);
    (first ?? node).focus();

    const onKey = (e: KeyboardEvent) => {
      // Keys typed inside a dialog belong to it: never let them reach the game's window listener.
      e.stopPropagation();
      if (e.key === 'Escape' && onEscapeRef.current) {
        e.preventDefault();
        onEscapeRef.current();
        return;
      }
      const shortcut = shortcutsRef.current?.[e.code];
      if (shortcut && !e.repeat) {
        e.preventDefault();
        shortcut();
        return;
      }
      if (e.key !== 'Tab') return;
      const items = [...node.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => el.offsetParent !== null);
      if (items.length === 0) {
        e.preventDefault();
        return;
      }
      const firstEl = items[0];
      const lastEl = items[items.length - 1];
      if (e.shiftKey && document.activeElement === firstEl) {
        e.preventDefault();
        lastEl.focus();
      } else if (!e.shiftKey && document.activeElement === lastEl) {
        e.preventDefault();
        firstEl.focus();
      }
    };
    // Keep focus inside while open (e.g. after a click on the backdrop focuses the page behind).
    const onFocusIn = (e: FocusEvent) => {
      if (e.target instanceof Node && !node.contains(e.target)) {
        (node.querySelector<HTMLElement>(FOCUSABLE) ?? node).focus();
      }
    };
    node.addEventListener('keydown', onKey);
    document.addEventListener('focusin', onFocusIn);
    return () => {
      node.removeEventListener('keydown', onKey);
      document.removeEventListener('focusin', onFocusIn);
      if (previous && document.contains(previous)) previous.focus();
    };
    // Focus management runs once per open dialog.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="pb-backdrop z-40">
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        aria-describedby={describedBy}
        tabIndex={-1}
        data-testid={testId}
        className={`pb-panel w-full ${className}`}
      >
        {children}
      </div>
    </div>
  );
}
