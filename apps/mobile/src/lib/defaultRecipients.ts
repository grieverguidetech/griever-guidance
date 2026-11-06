import type { TemplateCategory } from '@griever/shared';
import type { SendFlowDraft } from '@griever/hooks';

/** The per-moment "who was already sent this" lists kept on the device (session.recipientsNotified). */
export type Notified = Partial<Record<TemplateCategory, string[]>> | undefined;

/**
 * "Everyone you told": the people the announcement reached who are still saved, in announcement order.
 * The announcement is what "told" means, so it has no such set of its own.
 */
export function everyoneYouTold(category: TemplateCategory, notified: Notified, savedIds: string[]): string[] {
  if (category === 'announcement') {
    return [];
  }
  const saved = new Set(savedIds);
  return unique((notified?.announcement ?? []).filter((id) => saved.has(id)));
}

/**
 * "Not sent yet": saved people this moment has not reached. Empty until this moment has reached
 * at least one saved person, so a first-time moment shows no such shortcut.
 */
export function notSentYet(category: TemplateCategory, notified: Notified, savedIds: string[]): string[] {
  const thisMoment = new Set(notified?.[category] ?? []);
  if (!savedIds.some((id) => thisMoment.has(id))) {
    return [];
  }
  return unique(savedIds.filter((id) => !thisMoment.has(id)));
}

function unique(ids: string[]): string[] {
  return [...new Set(ids)];
}

/**
 * Who starts picked on a fresh draft (decided 2026-11-05). The service and the obituary link start with
 * "Everyone you told", less anyone this moment has already reached. The announcement and the thank-yous
 * start with nobody. Pure: the caller decides when a draft is fresh and applies this once.
 */
export function defaultPicked(category: TemplateCategory, notified: Notified, savedIds: string[]): string[] {
  if (category !== 'service' && category !== 'obituary') {
    return [];
  }
  const sent = new Set(notified?.[category] ?? []);
  return everyoneYouTold(category, notified, savedIds).filter((id) => !sent.has(id));
}

/**
 * True when no draft has moved past the picker for this moment, so the defaults may be applied. A saved
 * draft (even one the family cleared by hand) or one resumed mid-send never gets them added.
 * A moment finished earlier keeps no wording (C2), so it starts fresh again.
 */
export function startsFresh(saved: Pick<SendFlowDraft, 'step'> | null | undefined): boolean {
  return !saved || saved.step === 'template' || saved.step === 'sent';
}
