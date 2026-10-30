import early from '../checklist/details-early.json';
import later from '../checklist/details-later.json';

/** Guidance for one checklist item. `sources` is not shown in the UI in round 1. */
export interface ChecklistDetail {
  whatItIs: string;
  whyItMatters: string;
  whoToCall?: string;
  whatToBring?: string;
  doesNotApplyWhen?: string;
  sources?: string[];
}

function isProductionBuild(): boolean {
  try {
    return process.env.NODE_ENV === 'production';
  } catch {
    return false;
  }
}

/**
 * Merge the two detail files. An id in both is a mistake in the copy: it throws outside
 * production, and in production the "early" entry wins so the screen still renders.
 */
export function mergeChecklistDetails(
  first: Record<string, ChecklistDetail>,
  second: Record<string, ChecklistDetail>,
): Record<string, ChecklistDetail> {
  const merged: Record<string, ChecklistDetail> = { ...first };
  for (const [id, detail] of Object.entries(second)) {
    if (id in merged) {
      if (!isProductionBuild()) {
        throw new Error(`Checklist detail "${id}" is in both details files`);
      }
    } else {
      merged[id] = detail;
    }
  }
  return merged;
}

let cache: Record<string, ChecklistDetail> | undefined;

/** The guidance for a checklist item, or null when none is written yet. */
export function checklistDetail(id: string): ChecklistDetail | null {
  cache ??= mergeChecklistDetails(early as Record<string, ChecklistDetail>, later as Record<string, ChecklistDetail>);
  return Object.hasOwn(cache, id) ? cache[id] : null;
}
