import type { SectionKey } from '@griever/shared';

/** One tint class per phone section. Shared by the Overview phone card and the phone nudge. */
export const SECTION_TINT_CLASS: Partial<Record<SectionKey, string>> = {
  announcement: 'gg-tint-card gg-tint-announcement',
  service: 'gg-tint-card gg-tint-service',
  obituary: 'gg-tint-card gg-tint-obituary',
  thanks: 'gg-tint-card gg-tint-thanks',
};

/** The tint classes for a section, or an empty string for a section with no tint. */
export function sectionTintClass(key: SectionKey): string {
  return SECTION_TINT_CLASS[key] ?? '';
}
