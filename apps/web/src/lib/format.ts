import type { SendFlowDraft } from '@griever/hooks';
import { categoryLabels } from '@griever/shared';

/** Single user identity for the mocked account (Supabase is stubbed). */
export const LOCAL_USER_ID = 'local-device';

/** +16175550148 → (617) 555-0148 ; leaves anything unexpected untouched. */
export function formatPhone(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  const local = digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits;
  if (local.length !== 10) return raw;
  return `(${local.slice(0, 3)}) ${local.slice(3, 6)}-${local.slice(6)}`;
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

/** "Last opened 2 hours ago" — falls back to an absolute date past a week. */
export function formatRelativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const seconds = Math.round((Date.now() - then) / 1000);
  if (seconds < 45) return 'just now';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.round(hours / 24);
  if (days <= 7) return `${days} day${days === 1 ? '' : 's'} ago`;
  return formatDate(iso);
}

/** L2 in-progress card body: "Announcement — recipients chosen, not yet sent." */
export function draftStageLabel(draft: SendFlowDraft): string {
  const kind = draft.templateCategory
    ? categoryLabels[draft.templateCategory]
    : 'Message';
  const stage =
    draft.step === 'contacts'
      ? 'recipients chosen'
      : draft.step === 'review'
        ? 'ready to send'
        : draft.step === 'details' ||
            draft.step === 'announce' ||
            draft.step === 'serviceKnown'
          ? 'filling in details'
          : 'just started';
  return `${kind} — ${stage}, not yet sent.`;
}
