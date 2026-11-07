import { buildObituaryDraft, screenCopy } from '@griever/copy';
import type { Session } from '@griever/hooks';

const draftCopy = screenCopy('obituaryDraft');

export type ObituaryTextSource = Pick<
  Session,
  'personName' | 'dateOfPassing' | 'birthDate' | 'obituaryText' | 'obituaryCity' | 'obituaryCareer' | 'obituarySurvivors' | 'obituaryNote'
>;

/** True when any detail beyond the name is filled in, so a draft says more than the name alone. */
function hasFields(s: ObituaryTextSource): boolean {
  return [s.dateOfPassing, s.birthDate, s.obituaryCity, s.obituaryCareer, s.obituarySurvivors, s.obituaryNote].some(
    (v) => (v ?? '').trim() !== '',
  );
}

/**
 * The obituary text to send: the hand-edited text when there is one, else the draft built from the
 * fields (the same function and copy as web). Empty when neither has content.
 */
export function obituaryTextFor(s: ObituaryTextSource): string {
  const edited = s.obituaryText?.trim() ?? '';
  if (edited !== '') {
    return edited;
  }
  if (s.obituaryText !== undefined || !hasFields(s)) {
    return '';
  }
  return buildObituaryDraft(
    {
      fullName: s.personName ?? '',
      dateOfBirth: s.birthDate,
      dateOfPassing: s.dateOfPassing ?? undefined,
      cityOfResidence: s.obituaryCity,
      career: s.obituaryCareer,
      survivors: s.obituarySurvivors,
      personalNote: s.obituaryNote,
    },
    draftCopy,
  ).trim();
}
