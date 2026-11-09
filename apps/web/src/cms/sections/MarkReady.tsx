import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { Check } from '@phosphor-icons/react/Check';
import { fill, screenCopy } from '@griever/copy';
import type { SectionKey } from '@griever/shared';
import { navTitle } from '../SideNav';
import { PhoneNudge, clearDismissedNudge, readDismissedNudges, saveDismissedNudges, type PhoneNudgeSection } from './PhoneNudge';

const copy = screenCopy('cmsShell');

interface Props {
  ready: boolean;
  onChange: (ready: boolean) => void;
  /** The next section still to do, or null when none is left. Only used once Ready. */
  nextSection?: SectionKey | null;
  /** Without it no continue button shows. */
  onNext?: () => void;
  /** Opt in to the phone nudge (WEB-13) for this section. Without it nothing extra renders. */
  phoneNudge?: PhoneNudgeSection;
  /** Refuses to turn Ready on and says why. Ignored once ready, so the family can always take Ready back. */
  blockedMessage?: string;
}

/** A toggle (the libs/ui Button has no icon slot, so this is a plain button). A check shows when ready;
 * the name never changes and aria-pressed carries the state. A toggle, not a one-way switch: the family can take "ready" back at any time.
 * Once ready, one button leads on: to the next section, or back to the Overview when nothing is left. */
export function MarkReady({ ready, onChange, nextSection = null, onNext, phoneNudge, blockedMessage }: Props) {
  const hintId = useId();
  const blockedId = useId();
  const blocked = blockedMessage !== undefined && blockedMessage !== '' && !ready;
  // The live region text. A trailing no-break space on every second press makes a repeat press change the text, so it is read again.
  const [announced, setAnnounced] = useState('');
  const pressesRef = useRef(0);
  // A stale message must not be spoken without a press, so clear it when the block or its text changes.
  useEffect(() => {
    setAnnounced('');
    pressesRef.current = 0;
  }, [blocked, blockedMessage]);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const nudgeRef = useRef<HTMLDivElement>(null);
  // Set by the toggle click that turns ready, so focus moves to the nudge then and not on mount.
  const focusNudgeRef = useRef(false);
  const [dismissed, setDismissed] = useState(() => (phoneNudge ? readDismissedNudges() : []));
  const showNudge = phoneNudge !== undefined && ready && !dismissed.includes(phoneNudge);

  // Read before this render commits: was focus inside the nudge? If the nudge then goes away
  // (ready turned false), focus would drop to the page, so hand it to the toggle.
  const nudgeHadFocusRef = useRef(false);
  nudgeHadFocusRef.current = nudgeRef.current?.contains(document.activeElement) ?? false;
  useLayoutEffect(() => {
    if (!showNudge && nudgeHadFocusRef.current) {
      toggleRef.current?.focus();
    }
  }, [showNudge]);

  useEffect(() => {
    if (showNudge && focusNudgeRef.current) {
      nudgeRef.current?.focus();
    }
    focusNudgeRef.current = false;
  }, [showNudge]);

  function toggle() {
    if (blocked) {
      pressesRef.current += 1;
      setAnnounced(blockedMessage + (pressesRef.current % 2 === 0 ? '\u00A0' : ''));
      return;
    }
    // Got it lasts only until the section is marked ready again (#761), so any toggle clears it.
    if (phoneNudge !== undefined) {
      clearDismissedNudge(phoneNudge);
      setDismissed((current) => current.filter((name) => name !== phoneNudge));
    }
    focusNudgeRef.current = !ready && phoneNudge !== undefined;
    onChange(!ready);
  }

  function dismissNudge(section: PhoneNudgeSection) {
    const next = [...new Set([...readDismissedNudges(), ...dismissed, section])];
    setDismissed(next);
    saveDismissedNudges(next);
    // The Got it button goes away, so keep focus on the toggle.
    toggleRef.current?.focus();
  }
  return (
    <div className="flex flex-col gap-3 items-start">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <button
          ref={toggleRef}
          type="button"
          className="gg-chip gg-chip-outlined"
          aria-pressed={ready}
          aria-disabled={blocked ? 'true' : undefined}
          aria-describedby={blocked ? `${hintId} ${blockedId}` : hintId}
          onClick={toggle}
        >
          <span className="gg-check-box" data-testid="ready-box" aria-hidden="true">
            {ready && (
              <Check
                size={14}
                weight="bold"
                aria-hidden="true"
                className="motion-safe:transition-transform motion-safe:duration-[var(--dur-2)] motion-safe:ease-[var(--ease-calm)] motion-safe:starting:scale-[0.8]"
              />
            )}
          </span>
          {copy.markReady}
        </button>
        <p id={hintId} className="gg-hint">
          {copy.readyHint}
        </p>
      </div>
      {blocked ? (
        <p id={blockedId} className="m-0 text-[13px] font-semibold leading-[1.5] text-[var(--color-error)]">
          {blockedMessage}
        </p>
      ) : null}
      {blockedMessage ? (
        <p role="status" aria-live="polite" className="sr-only">
          {blocked ? announced : ''}
        </p>
      ) : null}
      {showNudge && phoneNudge ? <PhoneNudge section={phoneNudge} nudgeRef={nudgeRef} onDismiss={() => dismissNudge(phoneNudge)} /> : null}
      {ready && onNext ? (
        <button type="button" className={`gg-btn gg-btn-primary gg-enter min-h-[44px]${showNudge ? ' mt-3' : ''}`}
          onClick={onNext}>
          {nextSection ? fill(copy.next, { section: navTitle(nextSection) }) : copy.backToOverview}
        </button>
      ) : null}
    </div>
  );
}
