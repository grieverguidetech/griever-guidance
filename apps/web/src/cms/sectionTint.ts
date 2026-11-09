import type { SectionKey } from '@griever/shared';

/** The sections sent from the phone. */
export type PhoneSectionKey = Extract<SectionKey, 'announcement' | 'service' | 'obituary' | 'thanks'>;

/** One tint class per phone section. Shared by the Overview phone card and the phone nudge. */
export const SECTION_TINT_CLASS: Record<PhoneSectionKey, string> = {
  announcement: 'gg-tint-card gg-tint-announcement',
  service: 'gg-tint-card gg-tint-service',
  obituary: 'gg-tint-card gg-tint-obituary',
  thanks: 'gg-tint-card gg-tint-thanks',
};

/** The tint classes for a section, or an empty string for a section with no tint. */
export function sectionTintClass(key: SectionKey): string {
  return key in SECTION_TINT_CLASS ? SECTION_TINT_CLASS[key as PhoneSectionKey] : '';
}
