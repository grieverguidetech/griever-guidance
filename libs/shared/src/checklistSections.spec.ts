import { describe, expect, it } from 'vitest';
import { CHECKLIST_PHASES } from './checklist.js';
import { CHECKLIST_ITEM_SECTIONS } from './checklistSections.js';
import { SECTION_ORDER } from './sections.js';

const allIds: string[] = CHECKLIST_PHASES.flatMap((phase) => [
  ...phase.itemIds,
]);

describe('checklist item sections', () => {
  it('only names real checklist items', () => {
    for (const id of Object.keys(CHECKLIST_ITEM_SECTIONS)) {
      expect(allIds).toContain(id);
    }
  });

  it('only names valid sections', () => {
    for (const section of Object.values(CHECKLIST_ITEM_SECTIONS)) {
      expect(SECTION_ORDER).toContain(section);
    }
  });

  it('links the service items and leaves obituary and thank-you items out', () => {
    expect(CHECKLIST_ITEM_SECTIONS).toEqual({
      'set-service': 'service',
      officiant: 'service',
      'confirm-service-details': 'service',
      reception: 'service',
    });
  });
});
