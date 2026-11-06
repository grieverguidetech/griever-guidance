import type { TemplateCategory } from '@griever/shared';

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
