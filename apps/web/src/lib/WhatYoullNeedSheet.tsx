import { useEffect, useId, useRef, useState, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { ChecklistRows } from './ChecklistRows';

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])';

interface SheetProps {
  title: string;
  onClose: () => void;
  /** The button that opened the sheet. Safari does not focus a button on click, so pass it. */
  returnFocusRef?: RefObject<HTMLElement | null>;
  children: ReactNode;
}

/**
 * A dialog over the current screen. Focus moves in, Tab stays inside, Escape or Close shuts it,
 * and focus goes back to whatever had it before. Render it only while open: the form underneath
 * stays mounted, so nothing typed there is lost. Reusable for other short panels (#194).
 */
export function Sheet({ title, onClose, returnFocusRef, children }: SheetProps) {
  const titleId = useId();
  const panel = useRef<HTMLDivElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const [headingFocused, setHeadingFocused] = useState(false);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const returnRef = useRef(returnFocusRef);
  returnRef.current = returnFocusRef;

  useEffect(() => {
    const trigger = document.activeElement as HTMLElement | null;
    heading.current?.focus();

    // Everything behind the sheet is out of reach for keyboard, pointer and screen reader.
    const root = document.getElementById('root');
    const wasInert = root?.inert ?? false;
    const wasHidden = root?.getAttribute('aria-hidden') ?? null;
    if (root) {
      root.inert = true;
      root.setAttribute('aria-hidden', 'true');
    }
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const onKeyDown = (e: KeyboardEvent) => {
      const el = panel.current;
      if (!el) return;
      if (e.key === 'Escape') {
        // Something inside (an open tip) already used this Escape.
        if (e.defaultPrevented) return;
        e.preventDefault();
        closeRef.current();
        return;
      }
      if (e.key !== 'Tab') return;
      const items = Array.from(el.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && (active === first || active === heading.current)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      } else if (!el.contains(active)) {
        e.preventDefault();
        first.focus();
      }
    };
    // On window, so inner handlers on document run first and can claim the key.
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
      if (root) {
        root.inert = wasInert;
        if (wasHidden === null) root.removeAttribute('aria-hidden');
        else root.setAttribute('aria-hidden', wasHidden);
      }
      // After the page is live again, or the focus call would be ignored.
      const target = returnRef.current?.current ?? trigger;
      if (target?.isConnected) {
        target.focus();
      } else {
        // The screen was swapped while the sheet was open: land on the new page's heading, or Back.
        const fallback =
          document.querySelector<HTMLElement>('h1') ??
          Array.from(document.querySelectorAll<HTMLElement>('button')).find((b) => b.textContent?.trim() === 'Back');
        if (fallback) {
          if (!fallback.hasAttribute('tabindex') && fallback.tagName === 'H1') {
            fallback.setAttribute('tabindex', '-1');
          }
          fallback.focus();
        }
      }
    };
  }, []);

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-end justify-center"
      style={{ background: 'rgba(0, 0, 0, 0.4)' }}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="w-full max-w-[560px] max-h-[85vh] overflow-y-auto flex flex-col gap-4 p-5"
        style={{ background: 'var(--color-surface)', borderRadius: '16px 16px 0 0' }}
      >
        <div className="flex items-center justify-between gap-3">
          <h2
            ref={heading}
            id={titleId}
            tabIndex={-1}
            className="text-[18px] m-0 p-1"
            // An inset ring: the global focus mark sits off to the left and can leave the screen.
            style={headingFocused ? { outline: '2px solid transparent', boxShadow: 'inset 0 0 0 2px var(--color-accent-700)' } : undefined}
            onFocus={() => setHeadingFocused(true)}
            onBlur={() => setHeadingFocused(false)}
          >
            {title}
          </h2>
          <button type="button" onClick={onClose} className="gg-btn gg-btn-secondary gg-btn-bar min-h-[44px] min-w-[44px]">
            Close
          </button>
        </div>
        {children}
      </div>
    </div>,
    document.body,
  );
}

/** The "What you'll need" checklist in a sheet. Ticks are the same saved ticks as the full screen. */
export function WhatYoullNeedSheet({ onClose, returnFocusRef }: { onClose: () => void; returnFocusRef?: RefObject<HTMLElement | null> }) {
  return (
    <Sheet title="What you'll need" onClose={onClose} returnFocusRef={returnFocusRef}>
      <p className="text-[13px] m-0" style={{ color: 'var(--text-muted)' }}>
        Not today. Just so none of it surprises you.
      </p>
      <div className="gg-card">
        <span className="gg-card-kicker">The one people get wrong</span>
        <span className="gg-card-title text-[15px]">Certified death certificates</span>
        <p className="gg-card-body m-0">
          Ask the funeral home for <strong>8 to 10 certified copies</strong>. Banks, insurers and
          Social Security each keep an original — photocopies are usually refused.
        </p>
      </div>
      <div className="flex flex-col gap-3">
        <p className="gg-eyebrow m-0">Gather when you can</p>
        <ChecklistRows />
      </div>
      <p className="gg-reassure text-center m-0 text-[12px]">We won't remind you about this list.</p>
    </Sheet>
  );
}
