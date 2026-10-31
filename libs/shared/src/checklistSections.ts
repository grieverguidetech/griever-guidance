import type { ChecklistItemId } from './checklist.js';
import type { SectionKey } from './sections.js';

/**
 * Checklist items the editor has a section for. An item missing here has no link.
 */
export const CHECKLIST_ITEM_SECTIONS: Partial<
  Record<ChecklistItemId, SectionKey>
> = {
  'set-service': 'service',
  officiant: 'service',
  'confirm-service-details': 'service',
  reception: 'service',
  'write-obituary': 'obituary',
  'submit-obituary': 'obituary',
  'share-obituary': 'obituary',
  'notify-community': 'announcement',
  'tell-close-family': 'announcement',
  'thank-you-notes': 'thanks',
};
