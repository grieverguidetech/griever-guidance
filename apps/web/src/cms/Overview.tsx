import { fill, screenCopy } from '@griever/copy';
import { computeChecklist, computeSections } from '@griever/hooks';
import type { OverviewStatus } from '@griever/hooks';
import { parseCompleteDate, SECTION_ORDER } from '@griever/shared';
import type { ChecklistFields, ChecklistItemId, ChecklistPhaseKey, SectionFields, SectionKey, SessionDetails } from '@griever/shared';
import { PhoneReadyCard, readyPhoneSections } from './PhoneReady';
import { navTitle } from './SideNav';

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

type OverviewSession = Pick<SectionFields, 'sectionStatus' | 'serviceType' | 'servicePlace'> &
  Partial<
    Pick<
      SectionFields,
      'announcementMessage' | 'obituaryText' | 'obituaryCity' | 'obituaryCareer' | 'obituarySurvivors' | 'obituaryNote' | 'thanksMessage'
    >
  > &
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
  'hover:[background:color-mix(in_srgb,var(--color-text)_7%,var(--color-surface))] ' +
  'active:[background:color-mix(in_srgb,var(--color-text)_14%,var(--color-surface))]';
/** The next card: a 3px accent-700 bar down the left edge, drawn inside so nothing shifts. */
const NEXT_BAR = ' shadow-[inset_3px_0_0_var(--color-accent-700)]';

/** "May 29, 2026" when the date is complete; otherwise whatever was typed. */
function dateLabel(value: string): string {
  const date = parseCompleteDate(value);
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
  const passed = passedDate ? fill(shell.summaryPassed, { date: dateLabel(passedDate) }) : '';
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

const SUMMARY_MAX = 80;

/** First non-empty line of the message, cut short so a card stays one line. */
function announcementSummary(session: OverviewSession): string {
  const line = present(session.announcementMessage)
    .split('\n')
    .map((part) => part.trim())
    .find(Boolean);
  if (!line) {
    return shell.summaryAnnouncementEmpty;
  }
  return line.length > SUMMARY_MAX ? `${line.slice(0, SUMMARY_MAX).trimEnd()}…` : line;
}

function obituarySummary(session: OverviewSession): string {
  const publisher = present(session.obituaryPublisher);
  if (publisher) {
    return fill(shell.summaryObituaryPublisher, { publisher });
  }
  const started = [
    session.obituaryText,
    session.obituaryCity,
    session.obituaryCareer,
    session.obituarySurvivors,
    session.obituaryNote,
  ].some((value) => present(value));
  return started ? shell.summaryObituaryDraft : shell.summaryObituaryEmpty;
}

function thanksSummary(session: OverviewSession): string {
  return present(session.thanksMessage) ? shell.summaryThanksDraft : shell.summaryThanksEmpty;
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
                      <span className="text-[14px] font-semibold text-[color:var(--color-accent-700)]">
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

      <PhoneReadyCard ready={readyPhoneSections([session])} />

      {phase ? (
        item && onOpenItem ? (
          <button type="button" data-checklist-item={item} className={CARD} onClick={() => onOpenItem(item)}>
            <span className="text-[14px] font-semibold" style={{ color: 'var(--text-muted)' }}>
              {fill(checklist.nowPhase, { phase: PHASE_COPY[phase] })}
            </span>
            {' '}
            <span>{fill(checklist.onTheChecklist, { item: ITEM_COPY[item] })}</span>
          </button>
        ) : (
          <h2 className="font-semibold">{fill(checklist.nowPhase, { phase: PHASE_COPY[phase] })}</h2>
        )
      ) : null}
    </div>
  );
}
