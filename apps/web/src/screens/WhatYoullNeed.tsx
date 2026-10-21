import { useEffect, useState } from 'react';
import { accountStore } from '@griever/data-local';
import { CheckCircle } from '@phosphor-icons/react/CheckCircle';
import { Circle } from '@phosphor-icons/react/Circle';
import { TopBar } from '../lib/ui';

interface ChecklistItem {
  /** The key saved on this device when the row is ticked. Never change one. */
  id: string;
  label: string;
  meta?: string;
}

const CHECKLIST: ChecklistItem[] = [
  { id: 'will-or-wishes', label: 'Any will or written wishes', meta: 'Burial or cremation, and who they named' },
  { id: 'pre-arranged-plans', label: 'Pre-arranged funeral plans', meta: 'Many people have already paid for this' },
  { id: 'ssn-and-id', label: 'Social Security number and ID', meta: 'The funeral home uses the number to report the death. This app never asks for it or keeps it.' },
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

interface Props {
  onBack: () => void;
  onEmailList: () => void;
}

export function WhatYoullNeed({ onBack, onEmailList }: Props) {
  const { ticks, toggle, loaded } = useChecklistTicks();
  return (
    <div className="flex flex-col gap-4">
      <TopBar onBack={onBack} />
      <div className="flex flex-col gap-1">
        <h1 className="text-[22px]">What you'll need</h1>
        <p className="text-[13px] m-0" style={{ color: 'var(--text-muted)' }}>
          Not today. Just so none of it surprises you.
        </p>
      </div>

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
        {CHECKLIST.map((item) => {
          const checked = ticks.includes(item.id);
          return (
            <button
              key={item.id}
              type="button"
              aria-pressed={checked}
              disabled={!loaded}
              onClick={() => toggle(item.id)}
              className="flex items-start gap-3 text-left min-h-[44px] w-full"
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
          );
        })}
      </div>

      <button type="button" onClick={onEmailList} className="gg-btn gg-btn-secondary gg-btn-block">
        Email this list to me
      </button>
      <p className="gg-reassure text-center m-0 text-[12px]">We won't remind you about this list.</p>
    </div>
  );
}
