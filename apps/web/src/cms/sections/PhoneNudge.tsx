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

/** Storage can be blocked or broken or hold junk, so any failure means nothing is dismissed. */
export function readDismissedNudges(): PhoneNudgeSection[] {
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(PHONE_NUDGE_KEY) ?? '[]');
    return Array.isArray(parsed) ? parsed.filter((name): name is PhoneNudgeSection => name in LINES) : [];
  } catch {
    return [];
  }
}

export function saveDismissedNudges(dismissed: PhoneNudgeSection[]) {
  try {
    window.localStorage.setItem(PHONE_NUDGE_KEY, JSON.stringify(dismissed));
  } catch {
    // The choice just won't last past this visit.
  }
}

interface Props {
  section: PhoneNudgeSection;
  onDismiss: () => void;
}

/** One calm line, in the section's tint, saying where the sending happens. The primary button has its own
 * fill, so nothing depends on contrast against the tint; the card's padding leaves room for the focus ring. */
export function PhoneNudge({ section, onDismiss }: Props) {
  return (
    <div className={`${sectionTintClass(section)} flex flex-col items-start gap-3 p-4 gg-enter`}>
      <p>{LINES[section]}</p>
      <button type="button" className="gg-btn gg-btn-primary min-h-[44px]" onClick={onDismiss}>
        {copy.phoneNudgeDismiss}
      </button>
    </div>
  );
}
