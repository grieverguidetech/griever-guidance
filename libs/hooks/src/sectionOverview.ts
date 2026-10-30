import { SECTION_ORDER } from '@griever/shared';
import type { SectionFields, SectionKey } from '@griever/shared';

export type OverviewStatus = 'not_started' | 'in_progress' | 'ready';

export interface SectionOverview {
  sections: { key: SectionKey; status: OverviewStatus }[];
  next: SectionKey | null;
}

/** Status of every section in fixed order, plus the first one left to do. */
export function computeSections(
  session: Pick<SectionFields, 'sectionStatus'>,
  available: readonly SectionKey[] = SECTION_ORDER,
): SectionOverview {
  const sections = SECTION_ORDER.map((key) => ({
    key,
    status: session.sectionStatus?.[key] ?? ('not_started' as const),
  }));
  const next =
    sections.find(
      (section) => available.includes(section.key) && section.status !== 'ready',
    )?.key ?? null;

  return { sections, next };
}
