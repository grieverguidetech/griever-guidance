import { sendPrefill, templates } from '@griever/shared';
import type { MomentKey, TemplateField } from '@griever/shared';
import { hasObituaryLink, MOMENT_CATEGORY } from './usePathMoments.js';
import type { Session } from './useSessions.js';

/** What a person-screen card says about its moment. */
export type SendCardStatus = 'ready' | 'needsDetail' | 'waitingForLink' | { sent: number };

/**
 * Pure: reads the session and nothing else. `sent` when people were messaged (the obituary also
 * needs its link). `needsDetail` when a required field of the moment's template is still empty after
 * the planned details are filled in. `waitingForLink` for the obituary when its text is written and only
 * the link is missing (step 1 done, step 2 to come). Otherwise `ready`. The announcement never needs a detail.
 */
export function sendCardStatus(session: Session, key: MomentKey): SendCardStatus {
  const category = MOMENT_CATEGORY[key];
  const sent = session.recipientsNotified?.[category]?.length ?? 0;
  const hasLink = hasObituaryLink(session);
  if (sent > 0 && (key !== 'obituary' || hasLink)) {
    return { sent };
  }
  if (key === 'announce') {
    return 'ready';
  }
  if (!templates.some((t) => t.category === category)) {
    return 'ready';
  }
  const missing = firstMissingField(session, key) !== null;
  if (missing && key === 'obituary' && !hasLink && (session.obituaryText?.trim() ?? '') !== '') {
    return 'waitingForLink';
  }
  return missing ? 'needsDetail' : 'ready';
}

/**
 * The first required field of a moment's template that is still empty, after the planned details
 * and the obituary link are filled in. Null when none is missing (or the moment has no template).
 * The single source for sendCardStatus and for screens that name the missing field.
 */
export function firstMissingField(session: Session, key: MomentKey): TemplateField | null {
  const category = MOMENT_CATEGORY[key];
  const template = templates.find((t) => t.category === category);
  if (!template) {
    return null;
  }
  const filled: Record<string, string> = { ...sendPrefill(session, category).fields };
  if (hasObituaryLink(session)) {
    filled['obituaryUrl'] = session.obituaryUrl.trim();
  }
  return template.fields.find((field) => field.required && !filled[field.key]) ?? null;
}
