import { announcePassing, shareService, thankYouNote, type Template } from '@griever/shared';

/**
 * Content for `gg-content` (plan v4, decision 3). It has no user data (C2).
 * Key: `kind` (partition) + `id` (sort). Every item has a `version`.
 */
export interface ContentItem {
  kind: 'checklist' | 'sample' | 'example';
  id: string;
  version: number;
  /** Checklist only: a hidden item keeps its id, because ticks on devices use it. */
  hidden?: boolean;
  /** Checklist only: the order on screen, from 1. */
  order?: number;
  /** Checklist label, or the title of a sample or example. */
  label: string;
  /** Checklist only: why the item is needed (GRI-9). */
  reason?: string;
  /** Checklist only: a short reason shown when the info button is opened (SSN row). */
  tip?: string;
  /** Sample and example only: the message text. */
  text?: string;
}

/**
 * Copy of the CHECKLIST in apps/web/src/screens/WhatYoullNeed.tsx (`meta` is `reason` here). That
 * constant is private to the screen, so a unit test reads the file and fails if id, label, meta or
 * tip drift apart. The mobile screen has the same label, meta and tip, with its own ids.
 * Never change an id: ticks on devices use it.
 */
const SSN_TIP =
  "You'll need this number when you deal with the funeral home, insurance and banks. You do not need to add it to your account.";

export const CHECKLIST_SEED: ReadonlyArray<{ id: string; label: string; reason?: string; tip?: string }> = [
  { id: 'will-or-wishes', label: 'Any will or written wishes', reason: 'Burial or cremation, and who they named' },
  { id: 'pre-arranged-plans', label: 'Pre-arranged funeral plans', reason: 'Many people have already paid for this' },
  { id: 'ssn-and-id', label: 'Social Security number and ID', tip: SSN_TIP },
  { id: 'life-insurance', label: 'Life insurance policies' },
  { id: 'military-papers', label: 'Military discharge papers', reason: 'If they served — it may cover the burial' },
];

/** Made-up details, so the samples read like a real message. No real person. */
const SAMPLE_FIELDS: Record<string, string> = {
  deceasedName: 'Margaret Hayes',
  dateOfPassing: 'June 7',
  serviceDate: 'June 14',
  serviceTime: '2:00 PM',
  serviceLocation: "St. Mary's Church, Boston",
  senderName: 'The Hayes family',
  personalNote: 'Your kindness meant a great deal to us.',
};

function render(template: Template, extra: Record<string, string> = {}): string {
  return template.renderMessage({ ...SAMPLE_FIELDS, ...extra });
}

export function buildContent(): ContentItem[] {
  const checklist = CHECKLIST_SEED.map(
    (item, index): ContentItem => ({
      kind: 'checklist',
      id: item.id,
      version: 1,
      hidden: false,
      order: index + 1,
      label: item.label,
      reason: item.reason,
      tip: item.tip,
    }),
  );
  const samples: ContentItem[] = [
    { kind: 'sample', id: 'announcement', version: 1, label: announcePassing.name, text: render(announcePassing, { serviceDetailsKnown: 'no' }) },
    { kind: 'sample', id: 'service', version: 1, label: shareService.name, text: render(shareService) },
    { kind: 'sample', id: 'thank-you', version: 1, label: thankYouNote.name, text: render(thankYouNote) },
  ];
  const examples: ContentItem[] = [
    {
      kind: 'example',
      id: 'service-message',
      version: 1,
      label: 'Share the service',
      text: render(shareService, { serviceNotes: 'Reception to follow at the house.' }),
    },
  ];
  return [...checklist, ...samples, ...examples];
}
