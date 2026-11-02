import { hasObituaryLink, MOMENT_CATEGORY } from '@griever/hooks';
import type { Session } from '@griever/hooks';
import { sendPrefill, templates } from '@griever/shared';
import type { MomentKey, TemplateField } from '@griever/shared';

/**
 * The first required field of a moment's template that is still empty, filled the same way
 * sendCardStatus fills it (planned details plus the obituary link). Null when none is missing.
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

/** A template label as a phrase inside a sentence: "Service date and time" becomes "service date and time". */
export function fieldPhrase(label: string): string {
  return label.charAt(0).toLowerCase() + label.slice(1);
}
