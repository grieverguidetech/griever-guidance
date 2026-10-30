import type { ChecklistItemId } from './checklist.js';
import type { SectionKey } from './sections.js';

/**
 * Checklist items the editor has a section for. An item missing here has no link yet
 * (obituary, announcement and thank-you items wait for those sections).
 */
export const CHECKLIST_ITEM_SECTIONS: Partial<
  Record<ChecklistItemId, SectionKey>
> = {
  'set-service': 'service',
  officiant: 'service',
  'confirm-service-details': 'service',
  reception: 'service',
};
