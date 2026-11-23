import { useEffect, useId, useRef, useState } from 'react';
import type { ReactElement } from 'react';
import { ArrowLeft } from '@phosphor-icons/react/ArrowLeft';
import { ListChecks } from '@phosphor-icons/react/ListChecks';
import { WhatYoullNeedSheet } from './WhatYoullNeedSheet';

/**
 * Shows `text` above its child on hover or focus. The child is expected to
 * reference it via `aria-describedby={id}` (passed through the render prop), so
 * screen readers announce it too.
 */
export function Tooltip({ text, children }: { text: string; children: (id: string) => ReactElement }) {
  const id = useId();
  return (
    <span className="gg-tooltip">
      {children(id)}
      <span id={id} role="tooltip" className="gg-tooltip-text">
        {text}
      </span>
    </span>
  );
}

/** "Back" button: a visible border, at least 44 by 44, with the shared focus ring (#176). */
export function BackButton({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="gg-btn gg-btn-secondary self-start">
      <ArrowLeft size={16} weight="regular" aria-hidden="true" />
      Back
    </button>
  );
}

/**
 * Persistent top bar for every flow screen: Back on the left, "What you'll need" on the right.
 * The button opens one shared closable sheet over the current screen, never a separate page (#193, #194).
 */
export function TopBar({ onBack, hideChecklist = false }: { onBack?: () => void; hideChecklist?: boolean }) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const checklistButton = useRef<HTMLButtonElement>(null);
  return (
    <div className="flex items-center justify-between w-full">
      {onBack && <BackButton onClick={onBack} />}
      {!hideChecklist && (
        <button
          ref={checklistButton}
          type="button"
          aria-haspopup="dialog"
          onClick={() => setSheetOpen(true)}
          className="gg-btn gg-btn-primary ml-auto"
        >
          <ListChecks size={16} weight="duotone" aria-hidden="true" />
          What you'll need
        </button>
      )}
      {sheetOpen && <WhatYoullNeedSheet onClose={() => setSheetOpen(false)} returnFocusRef={checklistButton} />}
    </div>
  );
}

/** The "FOR <NAME>" accent eyebrow shown on every screen once a session exists. */
export function Eyebrow({ name, accent2 = false }: { name: string; accent2?: boolean }) {
  return (
    <p
      className="m-0 text-[11px] uppercase"
      style={{
        letterSpacing: '0.1em',
        color: accent2 ? 'var(--color-v2-heading)' : 'var(--color-v2-link)',
      }}
    >
      For {name}
    </p>
  );
}

/** The one reassurance line (DS-3): everything typed is already on this device. */
export function SavedNote() {
  return (
    <p className="gg-reassure text-center m-0 text-[12px]">
      Everything is saved on this phone as you go. You can stop and come back.
    </p>
  );
}

/** How the screen changed: a step on the same URL, a new router entry (PUSH or REPLACE), or Back/Forward (POP). */
export type ScreenMove = 'step' | 'new' | 'pop';

/** The router's side of a screen change, from `useLocation().key` and `useNavigationType()`. */
export type RouterMove = { locationKey: string; type: 'POP' | 'PUSH' | 'REPLACE' };

/** Some part of `el` is inside the window, and it is rendered. jsdom has no layout, so there every element counts. */
function inView(el: Element): boolean {
  if (typeof el.checkVisibility === 'function' && !el.checkVisibility()) {
    return false;
  }
  const rect = el.getBoundingClientRect();
  return rect.bottom >= 0 && rect.top < window.innerHeight;
}

/**
 * Focuses the new screen's h1 without fighting the router's scroll (#852).
 * - `step` (same URL): plain focus, which scrolls the h1 into view as it always did.
 * - `new` (PUSH or REPLACE): ScrollRestoration already put the page at the top, so no scroll.
 * - `pop` (Back or Forward): the page is back where it was. Focus the h1 only if it is in view; else
 *   the side nav's current link if that is in view (it is sticky from `md`); else leave focus alone,
 *   so the restored position stays.
 */
export function focusHeading(heading: HTMLElement, move: ScreenMove): void {
  heading.setAttribute('tabindex', '-1');
  if (move === 'step') {
    heading.focus();
    return;
  }
  if (move === 'new' || inView(heading)) {
    heading.focus({ preventScroll: true });
    return;
  }
  const current = Array.from(document.querySelectorAll<HTMLElement>('nav a[aria-current="page"]')).find(inView);
  current?.focus({ preventScroll: true });
}

/**
 * When `key` changes (a new view or flow step), moves focus to the new screen's
 * `<h1>` so a screen reader announces it. Until the person first presses, taps or
 * types, changes only update the recorded key: the app's own start-up redirects
 * (loading, then sign-in, then the right screen) are the initial screen, not
 * navigation. If the new screen has no h1 yet, the move waits and happens on the
 * first later render that has one. The heading is made focusable with
 * tabindex="-1" (not a tab stop); styles.css marks it differently from the ring.
 *
 * `router` is passed by a screen whose changes can be URL changes. A key change in the same render
 * as a new location key is a router move (see `focusHeading`); any other key change is a step.
 */
export function useFocusHeadingOnChange(key: string | undefined, router?: RouterMove) {
  const interacted = useRef(false);
  const previous = useRef(key);
  const pending = useRef(false);
  const move = useRef<ScreenMove>('step');
  const previousLocation = useRef(router?.locationKey);
  useEffect(() => {
    const events = ['pointerdown', 'keydown', 'click'] as const;
    const mark = () => {
      interacted.current = true;
      events.forEach((e) => document.removeEventListener(e, mark, true));
    };
    events.forEach((e) => document.addEventListener(e, mark, true));
    return () => events.forEach((e) => document.removeEventListener(e, mark, true));
  }, []);
  useEffect(() => {
    const locationMoved = router !== undefined && router.locationKey !== previousLocation.current;
    previousLocation.current = router?.locationKey;
    if (previous.current !== key) {
      previous.current = key;
      pending.current = interacted.current;
      if (!locationMoved) {
        move.current = 'step';
      } else {
        move.current = router.type === 'POP' ? 'pop' : 'new';
      }
    }
    if (!pending.current) {
      return;
    }
    const heading = document.querySelector('h1');
    if (!heading) {
      return;
    }
    pending.current = false;
    focusHeading(heading, move.current);
  });
}
