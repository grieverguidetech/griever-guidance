// The phase checklist ticks as flat wire keys (#1077). One key per item in CHECKLIST_PHASES, so two
// devices that tick different items never overwrite each other: the last save wins per item.
// `checklist` itself stays forbidden by name (flowFacts.ts); only these flat keys cross the wire.
// The five Gather ticks (`checklistTicks`) are device-only and never appear here.
import {
  CHECKLIST_PHASES,
  type ChecklistFields,
  type ChecklistItemId,
  type ChecklistItemState,
} from './checklist.js';

type Pascal<S extends string> = S extends `${infer Head}-${infer Tail}`
  ? `${Capitalize<Head>}${Pascal<Tail>}`
  : Capitalize<S>;

/** `check` plus the item id in PascalCase: 'burial-or-cremation' becomes 'checkBurialOrCremation'. */
export type ChecklistFlowKey = `check${Pascal<ChecklistItemId>}`;

/** On the wire null means the item is still open. */
export type ChecklistFlowValue = ChecklistItemState | null;

type ChecklistMap = NonNullable<ChecklistFields['checklist']>;

/**
 * The wire key for an item id. Derived from the id alone, so item ids must NEVER be renamed:
 * a renamed id is a new key, and every tick stored under the old key is orphaned.
 */
export function checklistFlowKey(itemId: string): ChecklistFlowKey {
  const pascal = itemId
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('');
  return `check${pascal}` as ChecklistFlowKey;
}

const ITEM_IDS: readonly ChecklistItemId[] = CHECKLIST_PHASES.flatMap((phase) => phase.itemIds);

/** Every checklist wire key, in phase order. */
export const CHECKLIST_FLOW_KEYS: readonly ChecklistFlowKey[] = ITEM_IDS.map(checklistFlowKey);

const ITEM_BY_KEY = new Map<string, ChecklistItemId>(
  ITEM_IDS.map((id) => [checklistFlowKey(id), id]),
);

export const isChecklistFlowKey = (key: string): key is ChecklistFlowKey => ITEM_BY_KEY.has(key);

export const isChecklistFlowValue = (value: unknown): value is ChecklistFlowValue =>
  value === null || value === 'done' || value === 'not_applicable';

/** All keys, always. A missing or unknown tick is null (open). Item ids not in the phases are ignored. */
export function checklistToFlat(
  checklist: ChecklistFields['checklist'] | undefined,
): Record<ChecklistFlowKey, ChecklistFlowValue> {
  const out = {} as Record<ChecklistFlowKey, ChecklistFlowValue>;
  for (const id of ITEM_IDS) {
    const state = checklist?.[id];
    out[checklistFlowKey(id)] = state === 'done' || state === 'not_applicable' ? state : null;
  }
  return out;
}

/** The reverse. Null and missing entries are left out, as a Session stores them. */
export function flatToChecklist(
  flat: Partial<Record<ChecklistFlowKey, ChecklistFlowValue>>,
): ChecklistMap {
  const out: ChecklistMap = {};
  for (const key of CHECKLIST_FLOW_KEYS) {
    const value = flat[key];
    if (value) {
      out[ITEM_BY_KEY.get(key) as ChecklistItemId] = value;
    }
  }
  return out;
}

/**
 * Merges the keys present in `flat` into `current`: a value sets the item, null clears it, a key
 * not in `flat` keeps the current tick. So a partial reply never wipes the other ticks.
 */
export function mergeFlatIntoChecklist(
  flat: Partial<Record<ChecklistFlowKey, ChecklistFlowValue>>,
  current: ChecklistFields['checklist'] = {},
): ChecklistMap {
  const next: ChecklistMap = { ...current };
  for (const key of CHECKLIST_FLOW_KEYS) {
    const value = flat[key];
    if (value === undefined) {
      continue;
    }
    const id = ITEM_BY_KEY.get(key) as ChecklistItemId;
    if (value === null) {
      delete next[id];
    } else {
      next[id] = value;
    }
  }
  return next;
}
