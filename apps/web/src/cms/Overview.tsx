import { fill, screenCopy } from '@griever/copy';
import { computeSections } from '@griever/hooks';
import type { OverviewStatus } from '@griever/hooks';
import { computeChecklist, FLOW_DETAIL_TEXT_KEYS, LIFE_YEARS, parseCompleteDate, SECTION_ORDER } from '@griever/shared';
import type { ChecklistFields, ChecklistItemId, ChecklistPhaseKey, SectionFields, SectionKey, SessionDetails } from '@griever/shared';
import { navTitle } from './SideNav';
import { announcementPrefill, summaryLine, thanksPrefill } from './sections/messagePrefill';

const shell = screenCopy('cmsShell');
const checklist = screenCopy('cmsChecklist');

/** Sections that can be opened and filled in. */
export const AVAILABLE_SECTIONS: readonly SectionKey[] = SECTION_ORDER;

const STATUS_COPY: Record<OverviewStatus, string> = {
  not_started: shell.statusNotStarted,
  in_progress: shell.statusInProgress,
  ready: shell.statusReady,
};

const PHASE_COPY: Record<ChecklistPhaseKey, string> = checklist.phases;
const ITEM_COPY: Record<ChecklistItemId, string> = checklist.items;

/** Every obituary text field: the text, the older fields and the new ones. */
type ObituaryKey = Extract<keyof SectionFields, `obituary${string}`>;
const OBITUARY_KEYS = FLOW_DETAIL_TEXT_KEYS.filter((key): key is ObituaryKey & typeof key =>
  key.startsWith('obituary'),
);

type OverviewSession = Pick<SectionFields, 'sectionStatus' | 'serviceType' | 'servicePlace'> &
  Partial<
    Pick<
      SectionFields,
      'announcementMessage' | 'thanksMessage'
    >
  > &
  Partial<Pick<SectionFields, ObituaryKey>> &
  Partial<Pick<SessionDetails, 'personName' | 'dateOfPassing' | 'serviceDate' | 'obituaryPublisher'>>;

interface Props {
  session: OverviewSession;
  checklist: ChecklistFields;
  onOpen: (key: SectionKey) => void;
  /** Without it the next item is not shown (no button that does nothing); the phase still is. */
  onOpenItem?: (itemId: ChecklistItemId) => void;
}

const CARD =
  'gg-panel w-full min-h-[44px] flex flex-col gap-1 text-left font-[inherit] text-[color:inherit] border-0 cursor-pointer ' +
  'hover:[background:color-mix(in_srgb,var(--color-text)_7%,var(--color-v2-field-fill))] ' +
  'active:[background:color-mix(in_srgb,var(--color-text)_14%,var(--color-v2-field-fill))]';
/**
 * The Now nudge: the selected side-nav item's background (bg-v2-wash, as SideNav.tsx), with the hover and pressed tints
 * mixed over that wash so it never turns grey. Text stays the page text colour (checked in Overview.spec).
 */
const NOW_CARD =
  'gg-panel w-full min-h-[44px] flex flex-col gap-1 text-left font-[inherit] text-[color:inherit] border-0 cursor-pointer bg-v2-wash ' +
  'hover:[background:color-mix(in_srgb,var(--color-text)_7%,var(--color-v2-wash))] ' +
  'active:[background:color-mix(in_srgb,var(--color-text)_14%,var(--color-v2-wash))]';
/** The next card: a 3px link-colour bar down the left edge, drawn inside so nothing shifts. */
const NEXT_BAR = ' shadow-[inset_3px_0_0_var(--color-v2-link)]';

/** "May 29, 2026" when the date is complete; otherwise whatever was typed. */
function dateLabel(value: string, years?: { minYear: number; maxYear: number }): string {
  const date = parseCompleteDate(value, years);
  if (!date) {
    return value;
  }
  return date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

function present(value: string | null | undefined): string {
  return value?.trim() ?? '';
}

function personSummary(session: OverviewSession): string {
  const name = present(session.personName);
  const passedDate = present(session.dateOfPassing);
  const passed = passedDate ? fill(shell.summaryPassed, { date: dateLabel(passedDate, LIFE_YEARS) }) : '';
  if (name && passed) {
    return fill(shell.summaryPersonJoin, { name, passed });
  }
  return name || passed || shell.summaryPersonEmpty;
}

function serviceSummary(session: OverviewSession): string {
  const type = present(session.serviceType);
  const date = present(session.serviceDate);
  const place = present(session.servicePlace);
  if (!type && !date && !place) {
    return shell.summaryServiceEmpty;
  }
  const head = type || shell.summaryServiceDefaultType;
  const withDate = date ? fill(shell.summaryServiceDate, { type: head, date: dateLabel(date) }) : head;
  return place ? fill(shell.summaryServicePlace, { summary: withDate, place }) : withDate;
}

/** Not saved yet (undefined) shows the prefill the section shows; cleared ('') keeps the prompt. */
function announcementSummary(session: OverviewSession): string {
  const text = session.announcementMessage ?? announcementPrefill(session);
  return summaryLine(text) || shell.summaryAnnouncementEmpty;
}

function obituarySummary(session: OverviewSession): string {
  const publisher = present(session.obituaryPublisher);
  if (publisher) {
    return fill(shell.summaryObituaryPublisher, { publisher });
  }
  const started = OBITUARY_KEYS.some((key) => present(session[key]));
  return started ? shell.summaryObituaryDraft : shell.summaryObituaryEmpty;
}

function thanksSummary(session: OverviewSession): string {
  const text = session.thanksMessage ?? thanksPrefill(session);
  return summaryLine(text) || shell.summaryThanksEmpty;
}

function summaryFor(key: SectionKey, session: OverviewSession): string {
  switch (key) {
    case 'person':
      return personSummary(session);
    case 'announcement':
      return announcementSummary(session);
    case 'obituary':
      return obituarySummary(session);
    case 'thanks':
      return thanksSummary(session);
    default:
      return serviceSummary(session);
  }
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
      className="shrink-0 text-[color:var(--color-v2-success)]"
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
    <div className="flex flex-col gap-4">
      {/* First in the content, so it reads straight after the shell's h1. gap-4 is the shell's own rhythm (CmsShell main and content), so the h1, the nudge and the intro are evenly spaced. */}
      {phase ? (
        item && onOpenItem ? (
          <button type="button" data-checklist-item={item} className={NOW_CARD} onClick={() => onOpenItem(item)}>
            <span className="text-[14px] font-semibold" style={{ color: 'var(--text-muted)' }}>
              {fill(checklist.nowPhase, { phase: PHASE_COPY[phase] })}
            </span>
            {' '}
            <span>{fill(checklist.onTheChecklist, { item: ITEM_COPY[item] })}</span>
          </button>
        ) : (
          <p className="font-semibold">{fill(checklist.nowPhase, { phase: PHASE_COPY[phase] })}</p>
        )
      ) : null}

      <p>{shell.overviewIntro}</p>

      <ul role="list" className="flex flex-col gap-2 list-none p-0 m-0">
        {SECTION_ORDER.map((key) => {
          const status = overview.sections.find((section) => section.key === key)?.status ?? 'not_started';
          const later = !AVAILABLE_SECTIONS.includes(key);
          return (
            <li key={key}>
              {later ? (
                <p className="m-0 flex items-center justify-between gap-2 px-[var(--space-3)] py-[var(--space-2)]">
                  <span>{navTitle(key)}</span>
                  {' '}
                  <span className="text-[14px] font-normal" style={{ color: 'var(--text-muted)' }}>
                    {shell.comingLater}
                  </span>
                </p>
              ) : (
                <button
                  type="button"
                  className={CARD + (key === nextSection ? NEXT_BAR : '')}
                  onClick={() => onOpen(key)}
                >
                  <span className="flex items-center justify-between gap-2">
                    <span className="font-semibold">{navTitle(key)}</span>
                    {' '}
                    <span className="flex items-center gap-2 text-[14px] font-normal">
                      {status === 'ready' ? <CheckIcon /> : null}
                      <span>{STATUS_COPY[status]}</span>
                    </span>
                  </span>
                  {' '}
                  <span className="text-[14px]" style={{ color: 'var(--text-muted)' }}>
                    {summaryFor(key, session)}
                  </span>
                  {key === nextSection ? (
                    <>
                      {' '}
                      <span className="text-[14px] font-semibold text-[color:var(--color-v2-link)]">
                        {shell.continue}
                      </span>
                    </>
                  ) : null}
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
