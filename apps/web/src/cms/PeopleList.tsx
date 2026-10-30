import type { Session } from '@griever/hooks';
import { namedSessionsByRecent } from '@griever/hooks';
import { fill, screenCopy } from '@griever/copy';
import { parseCompleteDate } from '@griever/shared';
import { CaretRight } from '@phosphor-icons/react/CaretRight';

const copy = screenCopy('cmsShell');

interface Props {
  sessions: Session[];
  onOpen: (id: string) => void;
  onCreate: () => void;
  /** False hides the create button (members can't start new people, C11). */
  canCreate: boolean;
}

/** "May 29, 2026" when the date is complete; otherwise whatever was typed. */
function passingLabel(value: string | null | undefined): string {
  const date = parseCompleteDate(value);
  if (!date) {
    return value?.trim() ?? '';
  }
  return date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

/** The named people, newest first, inside the shell (which owns the h1). */
export function PeopleList({ sessions, onOpen, onCreate, canCreate }: Props) {
  const people = namedSessionsByRecent(sessions);
  const createLabel = people.length > 0 ? copy.peopleCreateAnother : copy.peopleCreateFirst;

  // role="list" stays on the <ul>: with list-none styling, Safari/VoiceOver drop the list semantics.
  return (
    <section aria-label={copy.peopleListLabel} className="flex flex-col gap-4">
      {people.length > 0 && (
        <ul role="list" className="flex flex-col gap-2 list-none m-0 p-0">
          {people.map((s) => {
            const passed = passingLabel(s.dateOfPassing);
            return (
              <li key={s.id}>
                <button
                  type="button"
                  onClick={() => onOpen(s.id)}
                  aria-label={passed ? fill(copy.peoplePassed, { name: s.personName, date: passed }) : s.personName}
                  className="gg-card flex-row items-center justify-between gap-3 w-full text-left"
                  style={{
                    minHeight: 44,
                    border: '1px solid color-mix(in srgb, var(--color-ink) 50%, var(--color-bg))',
                  }}
                >
                  <span className="flex flex-col min-w-0 break-words">
                    <span className="gg-card-title">{s.personName}</span>
                    {passed && <span className="gg-card-meta">{passed}</span>}
                  </span>
                  <CaretRight size={16} aria-hidden="true" />
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {people.length === 0 && (
        <p className="text-[14px] m-0" style={{ color: 'var(--text-muted)' }}>
          {canCreate ? copy.peopleEmptyOwner : copy.peopleEmptyMember}
        </p>
      )}

      {canCreate && (
        <button type="button" onClick={onCreate} className="gg-btn gg-btn-primary gg-btn-block">
          {createLabel}
        </button>
      )}
    </section>
  );
}
