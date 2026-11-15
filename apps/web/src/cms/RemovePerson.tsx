import { useEffect, useId, useRef, useState } from 'react';
import { fill, screenCopy } from '@griever/copy';

const copy = screenCopy('account');

export type RemoveOutcome = 'removed' | 'offline' | 'failed';

interface Props {
  people: { id: string; name: string }[];
  /** Picks the confirm body: the account copy mentions people helping you, the device copy does not. */
  scope: 'account' | 'device';
  onRemove: (id: string) => Promise<RemoveOutcome>;
  headingLevel?: 2 | 3;
}

type Result = { outcome: RemoveOutcome; name: string } | null;
type FocusTarget = { row: string } | 'heading' | 'confirm';

function upperFirst(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** The remove panel: a button and a confirm step, never a swipe (C9). Presentational; the caller does the removal. */
export function RemovePerson({ people, scope, onRemove, headingLevel = 2 }: Props) {
  const id = useId();
  const Heading = headingLevel === 3 ? 'h3' : 'h2';
  const ConfirmHeading = headingLevel === 3 ? 'h4' : 'h3';
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<Result>(null);
  const confirmHeadingRef = useRef<HTMLHeadingElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const rowButtons = useRef(new Map<string, HTMLButtonElement>());
  const focusNext = useRef<FocusTarget | null>(null);
  const pendingRef = useRef(false);
  // Once shown, the panel stays so the last removal can still be announced and hold focus.
  const hadPeople = useRef(false);
  if (people.length > 0) {
    hadPeople.current = true;
  }

  // Focus follows the swap: into the confirm step when it opens, out to the chosen target when it closes.
  useEffect(() => {
    const target = focusNext.current;
    focusNext.current = null;
    if (confirmingId && (target === null || target === 'confirm')) {
      confirmHeadingRef.current?.focus();
    } else if (target === 'heading') {
      headingRef.current?.focus();
    } else if (target && target !== 'confirm') {
      rowButtons.current.get(target.row)?.focus();
    }
  }, [confirmingId, result]);

  if (people.length === 0 && !hadPeople.current) {
    return null;
  }

  function labelFor(person: { name: string }): string {
    return person.name.trim() === '' ? copy.removeUnnamed : person.name;
  }

  function keep(personId: string) {
    if (pendingRef.current) {
      return;
    }
    focusNext.current = { row: personId };
    setConfirmingId(null);
  }

  async function remove(personId: string, name: string) {
    if (pendingRef.current) {
      return;
    }
    pendingRef.current = true;
    setPending(true);
    setResult(null);
    let outcome: RemoveOutcome = 'failed';
    try {
      outcome = await onRemove(personId);
    } catch {
      outcome = 'failed';
    } finally {
      pendingRef.current = false;
      setPending(false);
    }
    if (outcome === 'removed') {
      focusNext.current = 'heading';
      setConfirmingId(null);
    } else {
      focusNext.current = 'confirm';
    }
    setResult({ outcome, name });
  }

  const status = result
    ? upperFirst(
        fill(
          result.outcome === 'removed'
            ? copy.removeDone
            : result.outcome === 'offline'
              ? copy.removeOffline
              : copy.removeFailed,
          { name: result.name },
        ),
      )
    : '';

  return (
    <section className="gg-panel flex flex-col gap-3" aria-labelledby={`${id}-heading`}>
      <Heading id={`${id}-heading`} ref={headingRef} tabIndex={-1} className="text-[16px] m-0">
        {copy.removeHeading}
      </Heading>
      <p role="status" aria-live="polite" className="m-0 text-[13px] font-semibold">
        {status}
      </p>
      {people.length > 0 && (
        <ul className="flex flex-col gap-3 m-0 p-0 list-none">
          {people.map((person) => {
            const name = labelFor(person);
            return (
              <li key={person.id} className="flex flex-col gap-3">
                {confirmingId === person.id ? (
                  <div role="group" aria-labelledby={`${id}-confirm`} className="flex flex-col gap-3">
                    <ConfirmHeading
                      id={`${id}-confirm`}
                      ref={confirmHeadingRef}
                      tabIndex={-1}
                      className="text-[16px] m-0"
                    >
                      {fill(copy.removeConfirmHeading, { name })}
                    </ConfirmHeading>
                    <p className="m-0">
                      {fill(scope === 'account' ? copy.removeBodyAccount : copy.removeBodyDevice, { name })}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        className="gg-btn gg-btn-primary"
                        aria-disabled={pending}
                        onClick={() => keep(person.id)}
                      >
                        {fill(copy.removeKeep, { name })}
                      </button>
                      <button
                        type="button"
                        className="gg-btn gg-btn-secondary"
                        aria-disabled={pending}
                        onClick={() => void remove(person.id, name)}
                      >
                        {fill(copy.removeConfirmAction, { name })}
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    ref={(el) => {
                      if (el) {
                        rowButtons.current.set(person.id, el);
                      } else {
                        rowButtons.current.delete(person.id);
                      }
                    }}
                    className="gg-btn gg-btn-secondary"
                    onClick={() => {
                      setResult(null);
                      setConfirmingId(person.id);
                    }}
                  >
                    {fill(copy.removeOpen, { name })}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
