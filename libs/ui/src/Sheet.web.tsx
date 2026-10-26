import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { colors, fontSerifStack, spacing } from '@griever/tokens';
import { Button } from './Button';
import type { SheetProps } from './sheetProps';

export type { SheetProps } from './sheetProps';

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])';

/**
 * A dialog over the current screen, drawn as a bottom sheet. Focus moves in, Tab stays inside,
 * Escape or Close shuts it, and focus goes back to whatever had it before (or `returnFocusRef`).
 * The page underneath stays mounted, so nothing typed there is lost. The page root (`inertRootId`,
 * default "root") is made inert while open, so it must not contain the sheet: it is portalled to body.
 */
export function Sheet({ visible = true, ...rest }: SheetProps) {
  if (!visible) {
    return null;
  }
  return <OpenSheet {...rest} />;
}

function OpenSheet({ title, closeLabel, onClose, returnFocusRef, fallbackFocusRef, inertRootId = 'root', children }: SheetProps) {
  const titleId = useId();
  const panel = useRef<HTMLDivElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const [headingFocused, setHeadingFocused] = useState(false);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const returnRef = useRef(returnFocusRef);
  returnRef.current = returnFocusRef;
  const fallbackRef = useRef(fallbackFocusRef);
  fallbackRef.current = fallbackFocusRef;

  useEffect(() => {
    const trigger = document.activeElement as HTMLElement | null;
    heading.current?.focus();

    // Everything behind the sheet is out of reach for keyboard, pointer and screen reader.
    const root = document.getElementById(inertRootId);
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
      if (!el) {
        return;
      }
      if (e.key === 'Escape') {
        // Something inside (an open tip) already used this Escape.
        if (e.defaultPrevented) {
          return;
        }
        e.preventDefault();
        closeRef.current();
        return;
      }
      if (e.key !== 'Tab') {
        return;
      }
      const items = Array.from(el.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (items.length === 0) {
        return;
      }
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
        if (wasHidden === null) {
          root.removeAttribute('aria-hidden');
        } else {
          root.setAttribute('aria-hidden', wasHidden);
        }
      }
      // After the page is live again, or the focus call would be ignored.
      const target = returnRef.current?.current ?? trigger;
      if (target?.isConnected) {
        target.focus();
        return;
      }
      // The screen was swapped while the sheet was open: use the caller's fallback, else the page heading.
      const fallback = fallbackRef.current?.current ?? document.querySelector<HTMLElement>('h1');
      if (fallback?.isConnected) {
        if (fallback instanceof HTMLElement && !fallback.hasAttribute('tabindex')) {
          fallback.setAttribute('tabindex', '-1');
        }
        fallback.focus();
      }
    };
  }, []);

  return createPortal(
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 50,
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'center',
        background: 'rgba(0, 0, 0, 0.4)',
      }}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        style={{
          boxSizing: 'border-box',
          width: '100%',
          maxWidth: 560,
          maxHeight: '85vh',
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
          gap: spacing[3],
          padding: spacing[4],
          background: colors.surface,
          borderRadius: '16px 16px 0 0',
          color: colors.ink,
          fontFamily: fontSerifStack,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: spacing[2] }}>
          <h2
            ref={heading}
            id={titleId}
            tabIndex={-1}
            style={{
              fontSize: 18,
              margin: 0,
              padding: spacing[1],
              // An inset ring: the global focus mark sits off to the left and can leave the screen.
              ...(headingFocused
                ? { outline: '2px solid transparent', boxShadow: `inset 0 0 0 2px ${colors['accent-700']}` }
                : undefined),
            }}
            onFocus={() => setHeadingFocused(true)}
            onBlur={() => setHeadingFocused(false)}
          >
            {title}
          </h2>
          <Button label={closeLabel} variant="secondary" onPress={onClose} />
        </div>
        {children}
      </div>
    </div>,
    document.body,
  );
}
