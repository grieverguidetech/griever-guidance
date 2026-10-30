import { useEffect, useRef } from 'react';
import { checklistDetail, screenCopy } from '@griever/copy';
import type { ChecklistItemId, ChecklistItemState } from '@griever/shared';
import { ItemStateToggles } from './ItemStateToggles';

const copy = screenCopy('cmsChecklist');

interface Props {
  itemId: ChecklistItemId;
  state: ChecklistItemState | null;
  onSetState: (state: ChecklistItemState | null) => void;
  onBack: () => void;
}

/**
 * More guidance for one item. No h1: CmsShell's title carries the item label.
 * Focus moves here on open; the caller returns focus to the item when Back is pressed.
 */
export function ChecklistItemDetail({ itemId, state, onSetState, onBack }: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    rootRef.current?.focus();
  }, [itemId]);

  const detail = checklistDetail(itemId);
  const parts = detail
    ? [
        { heading: copy.whatItIs, text: detail.whatItIs },
        { heading: copy.whyItMatters, text: detail.whyItMatters },
        { heading: copy.whoToCall, text: detail.whoToCall },
        { heading: copy.whatToBring, text: detail.whatToBring },
        { heading: copy.notApplicableWhen, text: detail.doesNotApplyWhen },
      ].filter((part) => Boolean(part.text))
    : [];

  return (
    <div ref={rootRef} tabIndex={-1} className="flex flex-col gap-6">
      <div>
        <button type="button" className="gg-btn gg-btn-secondary" onClick={onBack}>
          {copy.back}
        </button>
      </div>
      {detail ? (
        parts.map((part) => (
          <section key={part.heading} className="flex flex-col gap-2">
            <h2>{part.heading}</h2>
            <p>{part.text}</p>
          </section>
        ))
      ) : (
        <p>{copy.comingSoon}</p>
      )}
      <ItemStateToggles groupLabel={copy.items[itemId]} state={state} onChange={onSetState} />
    </div>
  );
}
