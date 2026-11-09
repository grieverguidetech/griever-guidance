import { useId } from 'react';
import { screenCopy } from '@griever/copy';
import { sectionTintClass } from '../sectionTint';

const copy = screenCopy('cmsShell');

export type PhoneNudgeSection = 'service' | 'announcement' | 'obituary' | 'thanks';

/** Device-only, never synced (WEB-13). Stored shape: a JSON array of the PhoneNudgeSection names
 * the family dismissed on this device, for every person, e.g. `["announcement"]`. */
export const PHONE_NUDGE_KEY = 'gg.cmsPhoneNudge.v1';

const LINES: Record<PhoneNudgeSection, string> = {
  announcement: copy.phoneNudgeAnnouncement,
  service: copy.phoneNudgeService,
  obituary: copy.phoneNudgeObituary,
  thanks: copy.phoneNudgeThanks,
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
  } catch {
    // The choice still lasts this visit (sessionDismissed), just not past it.
  }
}

interface Props {
  section: PhoneNudgeSection;
  onDismiss: () => void;
}

/** One calm line, in the section's tint, saying where the sending happens. The primary button has its own
 * fill, so nothing depends on contrast against the tint; the card's padding leaves room for the focus ring. */
export function PhoneNudge({ section, onDismiss }: Props) {
  const lineId = useId();
  return (
    <div className={`${sectionTintClass(section)} flex flex-col items-start gap-3 p-4 gg-enter`}>
      <p id={lineId}>{LINES[section]}</p>
      <button type="button" aria-describedby={lineId} className="gg-btn gg-btn-primary min-h-[44px]" onClick={onDismiss}>
        {copy.phoneNudgeDismiss}
      </button>
    </div>
  );
}
