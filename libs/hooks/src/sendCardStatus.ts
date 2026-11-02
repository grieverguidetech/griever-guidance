import { sendPrefill, templates } from '@griever/shared';
import type { MomentKey, TemplateCategory } from '@griever/shared';
import type { Session } from './useSessions.js';

/** What a person-screen card says about its moment. */
export type SendCardStatus = 'ready' | 'needsDetail' | { sent: number };

const CATEGORY: Record<MomentKey, TemplateCategory> = {
  announce: 'announcement',
  service: 'service',
  obituary: 'obituary',
  thanks: 'aftercare',
};

/**
 * Pure: reads the session and nothing else. `sent` when people were messaged (the obituary also
 * needs its link). `needsDetail` when a required field of the moment's template is still empty after
 * the planned details are filled in. Otherwise `ready`. The announcement never needs a detail.
 */
export function sendCardStatus(session: Session, key: MomentKey): SendCardStatus {
  const category = CATEGORY[key];
  const sent = session.recipientsNotified?.[category]?.length ?? 0;
  const hasLink = Boolean(session.obituaryUrl?.trim());
  if (sent > 0 && (key !== 'obituary' || hasLink)) {
    return { sent };
  }
  if (key === 'announce') {
    return 'ready';
  }
  const template = templates.find((t) => t.category === category);
  if (!template) {
    return 'ready';
  }
  const filled: Record<string, string> = { ...sendPrefill(session, category).fields };
  if (hasLink) {
    filled['obituaryUrl'] = session.obituaryUrl.trim();
  }
  const missing = template.fields.some((field) => field.required && !filled[field.key]);
  return missing ? 'needsDetail' : 'ready';
}
