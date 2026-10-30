export const CHECKLIST_PHASES = [
  {
    key: 'right-away',
    itemIds: [
      'pronouncement',
      'custody',
      'find-wishes',
      'tell-close-family',
      'dependents-care',
      'secure-home',
    ],
  },
  {
    key: 'first-days',
    itemIds: [
      'burial-or-cremation',
      'casket-or-urn',
      'set-service',
      'officiant',
      'death-certificates',
      'pallbearers',
      'viewing-clothing-photo',
    ],
  },
  {
    key: 'obituary',
    itemIds: [
      'confirm-service-details',
      'write-obituary',
      'submit-obituary',
      'share-obituary',
    ],
  },
  {
    key: 'planning-service',
    itemIds: [
      'flowers-programs-music',
      'guest-book',
      'reception',
      'eulogy',
      'family-transport',
      'notify-community',
    ],
  },
  {
    key: 'first-weeks',
    itemIds: [
      'notify-ssa',
      'notify-banks',
      'life-insurance-claims',
      'pension-retirement',
      'utilities-housing',
      'cancel-subscriptions',
      'forward-mail',
      'thank-you-notes',
    ],
  },
  {
    key: 'first-months',
    itemIds: [
      'will-and-probate',
      'retitle-property',
      'online-accounts',
      'final-tax-return',
      'headstone',
      'follow-up-claims',
    ],
  },
] as const;

export type ChecklistPhaseKey = (typeof CHECKLIST_PHASES)[number]['key'];

export type ChecklistItemId =
  (typeof CHECKLIST_PHASES)[number]['itemIds'][number];

export type ChecklistItemState = 'done' | 'not_applicable';

/** A missing key means the item is still open. */
export interface ChecklistFields {
  checklist?: Partial<Record<ChecklistItemId, ChecklistItemState>>;
}
