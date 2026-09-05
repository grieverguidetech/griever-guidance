import { useMemo } from 'react';
import type { Moment, MomentKey, TemplateCategory } from '@griever/shared';
import type { Session } from './useSessions.js';

/** Fixed real-world order — never reordered by the user. */
export const MOMENT_ORDER: MomentKey[] = ['announce', 'service', 'obituary', 'thanks'];

const MOMENT_CATEGORY: Record<MomentKey, TemplateCategory> = {
  announce: 'announcement',
  service: 'service',
  obituary: 'obituary',
  thanks: 'aftercare',
};

function isMomentDone(session: Session, key: MomentKey): boolean {
  const recipients = session.recipientsNotified?.[MOMENT_CATEGORY[key]] ?? [];
  if (key === 'obituary') return recipients.length > 0 && Boolean(session.obituaryUrl);
  return recipients.length > 0;
}

/** Pure derivation — moments are computed, never hand-edited. */
export function computeMoments(session: Session): Moment[] {
  let nextAssigned = false;
  return MOMENT_ORDER.map((key) => {
    const done = isMomentDone(session, key);
    const recipientCount = session.recipientsNotified?.[MOMENT_CATEGORY[key]]?.length;
    if (done) {
      return {
        key,
        status: 'done' as const,
        recipientCount,
        completedAt: session.momentCompletedAt?.[key],
      };
    }
    if (!nextAssigned) {
      nextAssigned = true;
      return { key, status: 'next' as const };
    }
    return { key, status: 'later' as const };
  });
}

export function usePathMoments(session: Session | null): Moment[] {
  return useMemo(() => (session ? computeMoments(session) : []), [session]);
}
