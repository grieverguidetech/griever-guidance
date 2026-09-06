import type { Template } from './types.js';

/**
 * Single entry point for turning the send-flow's collected fields into the
 * outgoing SMS body. Both the web review screen and the API `/send` route go
 * through the template's `renderMessage`, so the preview and what is actually
 * sent can never drift.
 */
export function composeMessage(
  template: Template | null | undefined,
  fields: Record<string, string>,
): string {
  if (!template) return '';
  return template.renderMessage(fields);
}
