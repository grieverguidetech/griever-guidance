import { useEffect, useId, useRef, useState } from 'react';
import { fill, screenCopy } from '@griever/copy';
import {
  OBITUARY_PEOPLE_MAX_ROWS,
  parsePeople,
  SURVIVOR_RELATIONS,
  serializePeople,
  type ObituaryPerson,
  type SurvivorRelation,
} from '@griever/shared';

const copy = screenCopy('cmsObituary');

const RELATION_LABELS: Record<SurvivorRelation, string> = {
  spouse: copy.relationSpouse,
  child: copy.relationChild,
  grandchild: copy.relationGrandchild,
  'great-grandchild': copy.relationGreatGrandchild,
  // Computed so the copy scanner does not read this key as text.
  [SURVIVOR_RELATIONS[4]]: copy.relationSecondGreatGrandchild,
  sibling: copy.relationSibling,
  parent: copy.relationParent,
};

interface Row {
  key: number;
  name: string;
  city: string;
  relation: string;
}

/** Rows hold any relation string; only listed relations were put in them. */
function toText(rows: readonly Row[]): string {
  return serializePeople(rows as readonly ObituaryPerson[]);
}

type Focus = { kind: 'name'; index: number } | { kind: 'add' };

interface Props {
  heading: string;
  relations: readonly string[];
  /** The list as text (JSON, or ''). */
  value: string;
  onChange: (text: string) => void;
}

/** One list of people with a name, a city and a relationship. Controlled; stores nothing itself. */
export function ObituaryPeople({ heading, relations, value, onChange }: Props) {
  const id = useId();
  const nextKey = useRef(0);
  const nameRefs = useRef<(HTMLInputElement | null)[]>([]);
  const addRef = useRef<HTMLButtonElement>(null);
  const pendingFocus = useRef<Focus | null>(null);
  const [message, setMessage] = useState('');

  function fromValue(text: string): Row[] {
    const parsed = parsePeople(text, relations);
    return (parsed ?? []).map((person) => ({ ...person, key: nextKey.current++ }));
  }

  // Empty rows are not in the text, so the rows live here until the text changes from outside.
  const [rows, setRows] = useState<Row[]>(() => fromValue(value));
  const [seenValue, setSeenValue] = useState(value);
  if (value !== seenValue) {
    setSeenValue(value);
    if (value !== toText(rows)) {
      setRows(fromValue(value));
    }
  }

  useEffect(() => {
    const target = pendingFocus.current;
    pendingFocus.current = null;
    if (!target) {
      return;
    }
    if (target.kind === 'name') {
      nameRefs.current[target.index]?.focus();
    } else {
      addRef.current?.focus();
    }
  });

  function update(next: Row[]) {
    const text = toText(next);
    setRows(next);
    setSeenValue(text);
    onChange(text);
  }

  function changeRow(index: number, patch: Partial<Row>) {
    update(rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  // Adding an empty row writes nothing, so a stored value that did not parse is kept until a real edit.
  function addRow() {
    if (rows.length >= OBITUARY_PEOPLE_MAX_ROWS) {
      return;
    }
    pendingFocus.current = { kind: 'name', index: rows.length };
    setMessage(rows.length + 1 >= OBITUARY_PEOPLE_MAX_ROWS ? copy.peopleLimit : '');
    setRows([...rows, { key: nextKey.current++, name: '', city: '', relation: relations[0] }]);
  }

  function removeRow(index: number) {
    const next = rows.filter((_, i) => i !== index);
    const removed = rows[index].name.trim();
    setMessage(
      removed === ''
        ? fill(copy.personRemovedUnnamed, { n: index + 1 })
        : fill(copy.personRemoved, { name: removed }),
    );
    pendingFocus.current = index < next.length ? { kind: 'name', index } : { kind: 'add' };
    update(next);
  }

  const atLimit = rows.length >= OBITUARY_PEOPLE_MAX_ROWS;

  return (
    <fieldset className="flex flex-col gap-4 min-w-0">
      <legend className="font-semibold">{heading}</legend>
      {rows.map((row, index) => {
        const n = String(index + 1);
        const field = (label: string) => fill(copy.personRowField, { field: label, n });
        const removeName =
          row.name.trim() === ''
            ? fill(copy.removePersonUnnamed, { n })
            : fill(copy.removePerson, { name: row.name.trim(), n });
        return (
          <div key={row.key} className="gg-panel flex flex-col gap-3">
            <div className="gg-field">
              <label htmlFor={`${id}-${row.key}-name`}>{field(copy.personNameColumn)}</label>
              <input
                id={`${id}-${row.key}-name`}
                ref={(el) => {
                  nameRefs.current[index] = el;
                }}
                type="text"
                className="gg-input"
                autoComplete="off"
                value={row.name}
                onChange={(e) => changeRow(index, { name: e.target.value })}
              />
            </div>
            <div className="gg-field">
              <label htmlFor={`${id}-${row.key}-city`}>{field(copy.personCityColumn)}</label>
              <input
                id={`${id}-${row.key}-city`}
                type="text"
                className="gg-input"
                autoComplete="off"
                value={row.city}
                onChange={(e) => changeRow(index, { city: e.target.value })}
              />
            </div>
            <div className="gg-field">
              <label htmlFor={`${id}-${row.key}-relation`}>{field(copy.personRelationColumn)}</label>
              <select
                id={`${id}-${row.key}-relation`}
                className="gg-input"
                value={row.relation}
                onChange={(e) => changeRow(index, { relation: e.target.value })}
              >
                {relations.map((relation) => (
                  <option key={relation} value={relation}>
                    {RELATION_LABELS[relation as SurvivorRelation]}
                  </option>
                ))}
              </select>
            </div>
            <button
              type="button"
              className="gg-btn gg-btn-secondary self-start min-h-[44px] min-w-[44px] max-w-full [overflow-wrap:anywhere]"
              onClick={() => removeRow(index)}
            >
              {removeName}
            </button>
          </div>
        );
      })}
      <p role="status" aria-live="polite">
        {message || (atLimit ? copy.peopleLimit : '')}
      </p>
      {atLimit ? null : (
        <button
          type="button"
          ref={addRef}
          className="gg-btn gg-btn-secondary self-start min-h-[44px]"
          onClick={addRow}
        >
          {copy.addPerson}
        </button>
      )}
    </fieldset>
  );
}
