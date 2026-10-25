import type { Template } from './types.js';
import { composeMessage } from './messageCompose.js';

/** Compose an on-device form preview, filling missing required values with calm prompts. */
export function previewMessage(template: Template, fields: Record<string, string>): string {
  const previewFields = { ...fields };
  for (const field of template.fields) {
    if (previewFields[field.key]?.trim()) continue;
    if (!field.required) {
      previewFields[field.key] = '';
      continue;
    }
    const subject = field.label.replace(/\s*\(optional\)$/i, '').toLowerCase();
    previewFields[field.key] = `[the ${subject}]`;
  }
  return composeMessage(template, previewFields);
}
