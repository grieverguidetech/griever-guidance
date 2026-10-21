import { useEffect, useId, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { ChecklistRows } from '../screens/WhatYoullNeed';

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])';

interface SheetProps {
  title: string;
  onClose: () => void;
  children: ReactNode;
}

/**
 * A dialog over the current screen. Focus moves in, Tab stays inside, Escape or Close shuts it,
 * and focus goes back to whatever had it before. Render it only while open: the form underneath
 * stays mounted, so nothing typed there is lost. Reusable for other short panels (#194).
 */
export function Sheet({ title, onClose, children }: SheetProps) {
  const titleId = useId();
  const panel = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    const trigger = document.activeElement as HTMLElement | null;
    panel.current?.focus();
    const onKeyDown = (e: KeyboardEvent) => {
      const el = panel.current;
      if (!el) return;
      if (e.key === 'Escape') {
        // An open "why we list this" tip takes the first Escape; the sheet takes the next.
        if (el.querySelector('[aria-expanded="true"]')) return;
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
      if (e.shiftKey && (active === first || active === el)) {
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
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      trigger?.focus();
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
        tabIndex={-1}
        className="w-full max-w-[560px] max-h-[85vh] overflow-y-auto flex flex-col gap-4 p-5"
        style={{ background: 'var(--surface, #fff)', borderRadius: '16px 16px 0 0' }}
      >
        <div className="flex items-center justify-between gap-3">
          <h2 id={titleId} className="text-[18px] m-0">
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
export function WhatYoullNeedSheet({ onClose }: { onClose: () => void }) {
  return (
    <Sheet title="What you'll need" onClose={onClose}>
      <p className="text-[13px] m-0" style={{ color: 'var(--text-muted)' }}>
        Not today. Just so none of it surprises you.
      </p>
      <ChecklistRows />
    </Sheet>
  );
}
