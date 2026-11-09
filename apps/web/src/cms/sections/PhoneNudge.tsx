import { useId, type Ref } from 'react';
import { screenCopy } from '@griever/copy';

const copy = screenCopy('cmsShell');

export type PhoneNudgeSection = 'service' | 'announcement' | 'obituary' | 'thanks';

/** Device-only, never synced (WEB-13). Stored shape: a JSON array of the PhoneNudgeSection names
 * the family dismissed on this device, for every person, e.g. `["announcement"]`. v2 (#761): Got it
 * lasts only until the section is marked ready again. Values saved under v1 are never read. */
export const PHONE_NUDGE_KEY = 'gg.cmsPhoneNudge.v2';
const OLD_PHONE_NUDGE_KEY = 'gg.cmsPhoneNudge.v1';

const LINES: Record<PhoneNudgeSection, string> = {
  announcement: copy.phoneNudgeAnnouncement,
  service: copy.phoneNudgeService,
  obituary: copy.phoneNudgeObituary,
  thanks: copy.phoneNudgeThanks,
};

const HEADINGS: Record<PhoneNudgeSection, string> = {
  announcement: copy.phoneNudgeAnnouncementHeading,
  service: copy.phoneNudgeServiceHeading,
  obituary: copy.phoneNudgeObituaryHeading,
  thanks: copy.phoneNudgeThanksHeading,
};

/** Dismissals made this visit. Kept so a dismissal lasts the visit even when storage throws. */
const sessionDismissed = new Set<PhoneNudgeSection>();

/** For tests only: forget this visit's dismissals. */
export function resetSessionDismissed() {
  sessionDismissed.clear();
}

/** Storage can be blocked or broken or hold junk, so any failure means nothing is dismissed. */
export function readDismissedNudges(): PhoneNudgeSection[] {
  let stored: PhoneNudgeSection[] = [];
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(PHONE_NUDGE_KEY) ?? '[]');
    if (Array.isArray(parsed)) {
      stored = parsed.filter((name): name is PhoneNudgeSection => typeof name === 'string' && Object.prototype.hasOwnProperty.call(LINES, name));
    }
  } catch {
    // Treated as nothing stored.
  }
  return [...new Set([...stored, ...sessionDismissed])];
}

export function saveDismissedNudges(dismissed: PhoneNudgeSection[]) {
  dismissed.forEach((name) => sessionDismissed.add(name));
  try {
    window.localStorage.setItem(PHONE_NUDGE_KEY, JSON.stringify(dismissed));
    window.localStorage.removeItem(OLD_PHONE_NUDGE_KEY);
  } catch {
    // The choice still lasts this visit (sessionDismissed), just not past it.
  }
}

/** Forgets one section's dismissal (state of the visit and storage). The other sections stay as they are. */
export function clearDismissedNudge(section: PhoneNudgeSection) {
  sessionDismissed.delete(section);
  saveDismissedNudges(readDismissedNudges().filter((name) => name !== section));
}

interface Props {
  section: PhoneNudgeSection;
  onDismiss: () => void;
  /** Lets the parent move focus here when the section turns ready. */
  nudgeRef?: Ref<HTMLDivElement>;
}

/** One blue card for every section: a heading, one line saying where the sending happens, and Got it at the right.
 * A labelled region the parent focuses when it appears, so the heading and line are announced once. The
 * focus ring (.gg-phone-nudge:focus in styles.css) shows after a mouse click too. */
export function PhoneNudge({ section, onDismiss, nudgeRef }: Props) {
  const headingId = useId();
  const lineId = useId();
  return (
    <div
      ref={nudgeRef}
      role="region"
      tabIndex={-1}
      aria-labelledby={headingId}
      aria-describedby={lineId}
      className="gg-phone-nudge flex w-full flex-wrap items-end gap-x-4 gap-y-3 p-4 gg-enter"
    >
      <div className="flex min-w-0 basis-56 flex-1 flex-col gap-1">
        <h2 id={headingId} className="text-base font-semibold">
          {HEADINGS[section]}
        </h2>
        <p id={lineId}>{LINES[section]}</p>
      </div>
      <button type="button" className="gg-btn gg-btn-primary ml-auto min-h-[44px]" onClick={onDismiss}>
        {copy.phoneNudgeDismiss}
      </button>
    </div>
  );
}
