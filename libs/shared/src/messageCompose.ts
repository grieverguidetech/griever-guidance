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

/** A single GSM-7 SMS segment (tasks/04-sending.md §6) — not exact (extended/Unicode chars cost more), a floor. */
export const SMS_SEGMENT_LENGTH = 160;

/**
 * How many segments a composed message will split into on the wire. Over 1
 * means the carrier may deliver the parts out of order — "shorten nothing,
 * just count and warn" (§6): this doesn't trim anything, callers decide what
 * to do with the number (the obituary link is what usually pushes it over).
 */
export function estimateSmsSegments(message: string): number {
  if (message.length === 0) return 0;
  return Math.ceil(message.length / SMS_SEGMENT_LENGTH);
}
