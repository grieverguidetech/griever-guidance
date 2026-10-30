import { checklistDetail, screenCopy } from '@griever/copy';
import { CHECKLIST_ITEM_SECTIONS } from '@griever/shared';
import type { ChecklistItemId, ChecklistItemState } from '@griever/shared';
import { AVAILABLE_SECTIONS } from '../Overview';
import { ItemStateToggles } from './ItemStateToggles';

const copy = screenCopy('cmsChecklist');

interface Props {
  itemId: ChecklistItemId;
  state: ChecklistItemState | null;
  onSetState: (state: ChecklistItemState | null) => void;
  onBack: () => void;
  /** Closes the item and opens the Service section. Without it, no button shows. */
  onOpenService?: () => void;
}

/**
 * More guidance for one item. No h1: CmsShell's title carries the item label.
 * The caller owns focus: it focuses the shell heading (which names the item) on open.
 */
export function ChecklistItemDetail({ itemId, state, onSetState, onBack, onOpenService }: Props) {
  const detail = checklistDetail(itemId);
  const parts = detail
    ? [
        { heading: copy.whatItIs, text: detail.whatItIs },
        { heading: copy.whyItMatters, text: detail.whyItMatters },
        { heading: copy.whoToCall, text: detail.whoToCall },
        { heading: copy.whatToBring, text: detail.whatToBring },
        { heading: copy.notApplicableWhen, text: detail.doesNotApplyWhen },
      ].filter((part) => Boolean(part.text?.trim()))
    : [];

  const section = CHECKLIST_ITEM_SECTIONS[itemId];
  const canOpenService =
    section === 'service' && AVAILABLE_SECTIONS.includes(section) && Boolean(onOpenService);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <button type="button" className="gg-btn gg-btn-secondary" onClick={onBack}>
          {copy.back}
        </button>
      </div>
      {detail ? (
        parts.map((part) => (
          <section key={part.heading} className="flex flex-col gap-2">
            <h2 className="text-lg font-semibold">{part.heading}</h2>
            <p>{part.text}</p>
          </section>
        ))
      ) : (
        <p>{copy.comingSoon}</p>
      )}
      {canOpenService ? (
        <div>
          <button type="button" className="gg-btn gg-btn-primary" onClick={onOpenService}>
            {copy.openService}
          </button>
        </div>
      ) : null}
      <ItemStateToggles groupLabel={copy.items[itemId]} state={state} onChange={onSetState} />
    </div>
  );
}
