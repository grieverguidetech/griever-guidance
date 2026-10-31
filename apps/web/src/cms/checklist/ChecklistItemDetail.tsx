import { CaretLeft } from '@phosphor-icons/react/CaretLeft';
import { checklistDetail, fill, screenCopy } from '@griever/copy';
import { CHECKLIST_ITEM_SECTIONS } from '@griever/shared';
import type { ChecklistItemId, ChecklistItemState } from '@griever/shared';
import type { SectionKey } from '@griever/shared';
import { AVAILABLE_SECTIONS } from '../Overview';
import { navTitle } from '../SideNav';
import { ItemStateToggles } from './ItemStateToggles';

const copy = screenCopy('cmsChecklist');

interface Props {
  itemId: ChecklistItemId;
  state: ChecklistItemState | null;
  onSetState: (state: ChecklistItemState | null) => void;
  onBack: () => void;
  /** Closes the item and opens its section. Without it, no button shows. */
  onOpenSection?: (section: SectionKey) => void;
}

/**
 * More guidance for one item. No h1: CmsShell's title carries the item label.
 * The caller owns focus: it focuses the shell heading (which names the item) on open.
 */
export function ChecklistItemDetail({ itemId, state, onSetState, onBack, onOpenSection }: Props) {
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
  const canOpenSection = section !== undefined && AVAILABLE_SECTIONS.includes(section) && Boolean(onOpenSection);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <button type="button" className="gg-btn gg-btn-ghost" onClick={onBack}>
          <CaretLeft aria-hidden="true" />
          {copy.back}
        </button>
      </div>
      <ItemStateToggles groupLabel={copy.items[itemId]} state={state} onChange={onSetState} />
      <div className="gg-panel flex flex-col">
        {detail ? (
          parts.map((part, index) => (
            <section
              key={part.heading}
              className={`flex flex-col gap-2 py-4 first:pt-0 last:pb-0${
                index > 0 ? ' border-t border-[var(--color-divider)]' : ''
              }`}
            >
              <h2 className="text-lg font-semibold">{part.heading}</h2>
              <p>{part.text}</p>
            </section>
          ))
        ) : (
          <p>{copy.comingSoon}</p>
        )}
      </div>
      {canOpenSection ? (
        <div>
          <button type="button" className="gg-btn gg-btn-primary" onClick={() => onOpenSection?.(section)}>
            {fill(copy.openSection, { section: navTitle(section) })}
          </button>
        </div>
      ) : null}
    </div>
  );
}
