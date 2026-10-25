import { useEffect, useRef, useState } from 'react';
import { accountStore } from '@griever/data-local';
import { CheckCircle } from '@phosphor-icons/react/CheckCircle';
import { Circle } from '@phosphor-icons/react/Circle';
import { Info } from '@phosphor-icons/react/Info';

interface ChecklistItem {
  /** The key saved on this device when the row is ticked. Never change one. */
  id: string;
  label: string;
  meta?: string;
  /** A short reason shown when the small info button next to the row is opened. */
  tip?: string;
}

/** Same words as the mobile list (a unit test compares the two). */
export const SSN_TIP =
  "You'll need this number when you deal with the funeral home, insurance and banks. You do not need to add it to your account.";

const CHECKLIST: ChecklistItem[] = [
  { id: 'will-or-wishes', label: 'Any will or written wishes', meta: 'Burial or cremation, and who they named' },
  { id: 'pre-arranged-plans', label: 'Pre-arranged funeral plans', meta: 'Many people have already paid for this' },
  { id: 'ssn-and-id', label: 'Social Security number and ID', tip: SSN_TIP },
  { id: 'life-insurance', label: 'Life insurance policies' },
  { id: 'military-papers', label: 'Military discharge papers', meta: 'If they served — it may cover the burial' },
];

/**
 * Ticks live on this device only (IndexedDB `account.checklistTicks`) and are read back here and
 * nowhere else: no network, no reminder, no badge, no count (C3, DATA.md §2.1).
 */
function useChecklistTicks() {
  const [ticks, setTicks] = useState<string[]>([]);
  // Rows stay off until the saved ticks are read, so an early tap cannot overwrite them.
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    let live = true;
    accountStore
      .getChecklistTicks()
      .then((saved) => {
        if (live) {
          setTicks(saved);
          setLoaded(true);
        }
      })
      .catch(() => {
        // Storage unavailable: the list still works for this visit.
        if (live) setLoaded(true);
      });
    return () => {
      live = false;
    };
  }, []);
  function toggle(id: string) {
    const next = ticks.includes(id) ? ticks.filter((t) => t !== id) : [...ticks, id];
    setTicks(next);
    accountStore.setChecklistTicks(next).catch(() => {
      // Not saved; the tick still shows until the screen closes.
    });
  }
  return { ticks, toggle, loaded };
}

interface RowProps {
  item: ChecklistItem;
  checked: boolean;
  loaded: boolean;
  onToggle: () => void;
}

function ChecklistRow({ item, checked, loaded, onToggle }: RowProps) {
  const [tipOpen, setTipOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const infoButton = useRef<HTMLButtonElement>(null);
  const tipId = `tip-${item.id}`;

  useEffect(() => {
    if (!tipOpen) return;
    // Tap outside closes the tip. Escape closes it and puts focus back on the info button.
    const onPointerDown = (e: PointerEvent) => {
      if (wrap.current && !wrap.current.contains(e.target as Node)) setTipOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      // Tells a dialog around this row (the sheet) that Escape was used up closing the tip.
      e.preventDefault();
      setTipOpen(false);
      // Only pull focus back when it was in this row; leave it where the user is otherwise.
      if (wrap.current?.contains(document.activeElement)) infoButton.current?.focus();
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [tipOpen]);

  return (
    <div ref={wrap} className="flex flex-col">
      <div className="flex items-start gap-1">
        <button
          type="button"
          aria-pressed={checked}
          disabled={!loaded}
          onClick={() => {
            setTipOpen(false);
            onToggle();
          }}
          className="flex items-start gap-3 text-left min-h-[44px] flex-1"
        >
          {checked ? (
            <CheckCircle size={22} weight="fill" aria-hidden="true" style={{ color: 'var(--color-accent-700)' }} />
          ) : (
            <Circle size={22} weight="regular" aria-hidden="true" style={{ color: 'var(--color-neutral-600)' }} />
          )}
          <div>
            <div className={`text-[14px]${checked ? ' line-through' : ''}`}>{item.label}</div>
            {item.meta && <div className="gg-card-meta">{item.meta}</div>}
          </div>
        </button>
        {item.tip && (
          <button
            ref={infoButton}
            type="button"
            aria-label="Why we list this"
            aria-expanded={tipOpen}
            aria-controls={tipId}
            onClick={() => setTipOpen((open) => !open)}
            className="flex items-center justify-center min-h-[44px] min-w-[44px]"
          >
            <Info size={20} weight="regular" aria-hidden="true" style={{ color: 'var(--color-neutral-600)' }} />
          </button>
        )}
      </div>
      {item.tip && (
        // Always in the page so the screen reader reads the tip when its text appears.
        <p id={tipId} role="status" className="gg-card-meta m-0 pl-[34px]">
          {tipOpen ? item.tip : ''}
        </p>
      )}
    </div>
  );
}

/**
 * The tickable rows. Shared by the checklist screen and "Your account", so a tick on one shows on
 * the other: both read and write the same saved ticks.
 */
export function ChecklistRows() {
  const { ticks, toggle, loaded } = useChecklistTicks();
  return (
    <div className="flex flex-col gap-3">
      {CHECKLIST.map((item) => (
        <ChecklistRow key={item.id} item={item} checked={ticks.includes(item.id)} loaded={loaded} onToggle={() => toggle(item.id)} />
      ))}
    </div>
  );
}
