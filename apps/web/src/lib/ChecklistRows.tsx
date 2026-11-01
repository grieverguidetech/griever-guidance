import { useEffect, useState } from 'react';
import { accountStore } from '@griever/data-local';
import { CheckCircle } from '@phosphor-icons/react/CheckCircle';
import { Circle } from '@phosphor-icons/react/Circle';
import { screenCopy } from '@griever/copy';

const copy = screenCopy('cmsChecklist');

interface ChecklistItem {
  /** The key saved on this device when the row is ticked. Never change one. */
  id: string;
  label: string;
  meta?: string;
  /** A calm note shown under the row, always visible. */
  note?: string;
}

const CHECKLIST: ChecklistItem[] = [
  { id: 'will-or-wishes', label: 'Any will or written wishes', meta: 'Burial or cremation, and who they named' },
  { id: 'pre-arranged-plans', label: 'Pre-arranged funeral plans', meta: 'Many people have already paid for this' },
  { id: 'ssn-and-id', label: 'Social Security number and ID', note: copy.gatherNotes.ssn },
  { id: 'life-insurance', label: 'Life insurance policies', note: copy.gatherNotes.insurance },
  { id: 'military-papers', label: 'Military discharge papers', meta: 'If they served — it may cover the burial', note: copy.gatherNotes.military },
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
  const noteId = `note-${item.id}`;
  return (
    <div className="flex flex-col">
      <button
        type="button"
        aria-pressed={checked}
        aria-describedby={item.note ? noteId : undefined}
        disabled={!loaded}
        onClick={onToggle}
        className="flex items-start gap-3 text-left min-h-[44px]"
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
      {item.note && (
        <p id={noteId} className="gg-card-meta m-0 pl-[34px]">
          {item.note}
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
