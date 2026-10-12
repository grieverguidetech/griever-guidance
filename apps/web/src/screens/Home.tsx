import type { Session } from '@griever/hooks';
import { namedSessionsByRecent } from '@griever/hooks';
import { parseCompleteDate } from '@griever/shared';
import { CaretRight } from '@phosphor-icons/react';
import { TopBar } from '../lib/ui';

interface Props {
  sessions: Session[];
  onOpen: (id: string) => void;
  onCreate: () => void;
  /** False hides the create button (members can't start new people). */
  canCreate: boolean;
}

/** "May 29, 2026" when the date is complete; otherwise whatever was typed. */
function passingLabel(value: string | null | undefined): string {
  const date = parseCompleteDate(value);
  if (!date) return value?.trim() ?? '';
  return date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

export function Home({ sessions, onOpen, onCreate, canCreate }: Props) {
  const people = namedSessionsByRecent(sessions);
  // "Start with" for a first person; "Someone else" once there is already someone listed.
  const createLabel = people.length > 0 ? "Someone else I've lost" : "Start with someone I've lost";

  return (
    <div className="flex flex-col gap-4 pt-[52px] min-h-full">
      <TopBar />
      <h1 className="text-[22px]">The people you're writing about</h1>

      {people.length > 0 && (
        <ul className="flex flex-col gap-2 list-none m-0 p-0">
          {people.map((s) => {
            const passed = passingLabel(s.dateOfPassing);
            return (
              <li key={s.id}>
                <button
                  type="button"
                  onClick={() => onOpen(s.id)}
                  className="gg-card flex-row items-center justify-between gap-3 w-full text-left"
                  style={{ minHeight: 44 }}
                >
                  <span className="flex flex-col">
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

      {canCreate && (
        <button
          type="button"
          onClick={onCreate}
          className="gg-btn gg-btn-primary gg-btn-block"
          style={{ marginTop: 'auto' }}
        >
          {createLabel}
        </button>
      )}
    </div>
  );
}
