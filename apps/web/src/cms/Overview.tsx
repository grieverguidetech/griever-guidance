import { fill, screenCopy } from '@griever/copy';
import { computeChecklist, computeSections } from '@griever/hooks';
import type { OverviewStatus } from '@griever/hooks';
import { SECTION_ORDER } from '@griever/shared';
import type { ChecklistFields, ChecklistItemId, ChecklistPhaseKey, SectionFields, SectionKey } from '@griever/shared';
import { navTitle } from './SideNav';

const shell = screenCopy('cmsShell');
const checklist = screenCopy('cmsChecklist');

/** Sections that can be opened and filled in today; each editor ticket widens this. */
export const AVAILABLE_SECTIONS: readonly SectionKey[] = ['person', 'service'];

const STATUS_COPY: Record<OverviewStatus, string> = {
  not_started: shell.statusNotStarted,
  in_progress: shell.statusInProgress,
  ready: shell.statusReady,
};

const PHASE_COPY: Record<ChecklistPhaseKey, string> = checklist.phases;
const ITEM_COPY: Record<ChecklistItemId, string> = checklist.items;

interface Props {
  session: Pick<SectionFields, 'sectionStatus'>;
  checklist: ChecklistFields;
  onOpen: (key: SectionKey) => void;
  /** Without it the next item is not shown (no button that does nothing); the phase still is. */
  onOpenItem?: (itemId: ChecklistItemId) => void;
}

/** Decorative; the status text beside it carries the meaning. */
function CheckIcon() {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="shrink-0 text-[color:var(--color-success-700)]"
    >
      <path d="M3 8.5l3.2 3.2L13 4.8" />
    </svg>
  );
}

/** Where each part stands and one next thing. The shell owns the page's h1. */
export function Overview({ session, checklist: checklistState, onOpen, onOpenItem }: Props) {
  const overview = computeSections(session, AVAILABLE_SECTIONS);
  const progress = computeChecklist(checklistState);
  const phase = progress.currentPhase;
  const item = progress.nextItem;
  const nextSection = overview.next;

  return (
    <div className="flex flex-col gap-6">
      <p>{shell.overviewIntro}</p>

      {nextSection ? (
        <button type="button" className="gg-btn gg-btn-primary self-start" onClick={() => onOpen(nextSection)}>
          {fill(shell.next, { section: navTitle(nextSection) })}
        </button>
      ) : null}

      <ul role="list" className="flex flex-col gap-1 list-none p-0 m-0">
        {SECTION_ORDER.map((key) => {
          const status = overview.sections.find((section) => section.key === key)?.status ?? 'not_started';
          const later = !AVAILABLE_SECTIONS.includes(key);
          return (
            <li key={key}>
              <button
                type="button"
                className="gg-btn gg-btn-secondary w-full !justify-between text-left"
                onClick={() => onOpen(key)}
              >
                <span>{navTitle(key)}</span>
                {' '}
                <span className="flex items-center gap-2 text-[14px] font-normal">
                  {!later && status === 'ready' ? <CheckIcon /> : null}
                  <span>{later ? shell.comingLater : STATUS_COPY[status]}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      {phase ? (
        <div className="flex flex-col gap-2">
          <h2 className="font-semibold">{fill(checklist.nowPhase, { phase: PHASE_COPY[phase] })}</h2>
          {item && onOpenItem ? (
            <button
              type="button"
              className="gg-btn gg-btn-secondary self-start text-left"
              onClick={() => onOpenItem(item)}
            >
              {fill(checklist.nextItem, { item: ITEM_COPY[item] })}
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
