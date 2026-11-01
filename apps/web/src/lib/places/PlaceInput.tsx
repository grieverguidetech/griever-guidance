import { useEffect, useId, useRef, useState } from 'react';
import { fill, screenCopy } from '@griever/copy';
import { usePlaces } from './PlacesContext';
import type { PlaceSuggestion, PlacesToken } from './placesClient';

const copy = screenCopy('cmsService');

export const PLACE_DEBOUNCE_MS = 300;
export const PLACE_MIN_CHARS = 3;

/** The polite announcement for a number of suggestions. */
export const countText = (n: number): string =>
  n === 0 ? copy.placesNone : n === 1 ? copy.placesOne : fill(copy.placesMany, { count: n });

interface Props {
  id: string;
  /** Ids of the elements that name the field, as for a plain input. */
  labelledBy: string;
  value: string;
  onChange: (value: string) => void;
  /** Google place types to suggest. Without them the field is a plain text input. */
  types?: readonly string[];
  /**
   * Takes over a pick, to fill more than this field. Without it a pick sets the value to the whole line.
   * Return true when it also filled another field; the status then says so.
   */
  onPick?: (suggestion: PlaceSuggestion) => boolean | void;
}

/**
 * A text field that can suggest places (WAI-ARIA combobox with a listbox popup, list autocomplete).
 * The typed text is always the value. Suggestions only help; with none available, or on any
 * failure, it behaves as a plain input and shows no error.
 */
export function PlaceInput({ id, labelledBy, value, onChange, types, onPick }: Props) {
  const { enabled, load } = usePlaces();
  // Set when Google could not load. The field then drops every combobox attribute.
  const [unavailable, setUnavailable] = useState(false);
  const suggesting = enabled && types !== undefined && !unavailable;
  const listId = `${useId()}-list`;
  const [options, setOptions] = useState<PlaceSuggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [announcement, setAnnouncement] = useState('');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Bumped on every keystroke and close, so a late answer for old text is dropped.
  const request = useRef(0);
  // One token per search session of this field. Per Google's docs, requests without a token are
  // billed per request; with one, a session that ends without a Place Details call is billed for the
  // search only. So a session ends on a pick, Escape or leaving the field. Fields never share one.
  const token = useRef<PlacesToken | null>(null);

  useEffect(
    () => () => {
      if (timer.current) {
        clearTimeout(timer.current);
      }
      request.current += 1;
    },
    [],
  );

  useEffect(() => {
    if (open && active >= 0) {
      document.getElementById(`${listId}-${active}`)?.scrollIntoView?.({ block: 'nearest' });
    }
  }, [open, active, listId]);

  const cancelPending = () => {
    request.current += 1;
    if (timer.current) {
      clearTimeout(timer.current);
    }
  };

  const hideList = () => {
    setOpen(false);
    setActive(-1);
  };

  /** Closes the list and ends the search session. Typed text stays. */
  const stop = () => {
    cancelPending();
    hideList();
    setAnnouncement('');
    token.current = null;
  };

  const search = async (text: string, ticket: number) => {
    if (!types) {
      return;
    }
    try {
      const client = await load();
      if (ticket !== request.current) {
        return;
      }
      if (!client) {
        setUnavailable(true);
        return;
      }
      token.current ??= client.newToken();
      const found = await client.suggest(text, types, token.current);
      if (ticket !== request.current) {
        return;
      }
      setOptions(found);
      setActive(-1);
      setOpen(found.length > 0);
      setAnnouncement(countText(found.length));
    } catch {
      // Suggestions are a convenience. A failure leaves a plain field and says nothing.
      if (ticket === request.current) {
        hideList();
        setAnnouncement('');
      }
    }
  };

  const handleChange = (text: string) => {
    onChange(text);
    cancelPending();
    setActive(-1);
    if (!suggesting || text.trim().length < PLACE_MIN_CHARS) {
      hideList();
      setOptions([]);
      setAnnouncement('');
      return;
    }
    // The list stays as it is until the new answer arrives, so it does not flicker on each key.
    const ticket = request.current;
    timer.current = setTimeout(() => void search(text.trim(), ticket), PLACE_DEBOUNCE_MS);
  };

  const choose = (option: PlaceSuggestion) => {
    const filledMore = onPick ? onPick(option) === true : (onChange(option.text), false);
    stop();
    setOptions([]);
    if (filledMore) {
      setAnnouncement(copy.placesAddressFilled);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown' && !open && options.length > 0) {
      e.preventDefault();
      setOpen(true);
      setActive(0);
      setAnnouncement(countText(options.length));
      return;
    }
    if (!open) {
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((a) => (a + 1) % options.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => (a <= 0 ? options.length - 1 : a - 1));
    } else if (e.key === 'Enter' && active >= 0) {
      e.preventDefault();
      choose(options[active]);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      stop();
    }
  };

  const optionId = (i: number) => `${listId}-${i}`;
  const comboboxProps = suggesting
    ? {
        role: 'combobox',
        'aria-autocomplete': 'list' as const,
        'aria-expanded': open,
        'aria-controls': listId,
        'aria-activedescendant': open && active >= 0 ? optionId(active) : undefined,
      }
    : {};

  return (
    <div className="relative">
      <input
        id={id}
        aria-labelledby={labelledBy}
        type="text"
        {...comboboxProps}
        className="gg-input"
        autoComplete="off"
        value={value}
        onChange={(e) => handleChange(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={stop}
      />
      {suggesting && (
        <>
          <ul
            id={listId}
            role="listbox"
            aria-label={copy.placesListLabel}
            hidden={!open}
            className="absolute left-0 right-0 z-10 m-0 mt-1 max-h-72 list-none overflow-auto rounded-md border border-neutral-600 bg-bg p-0"
          >
            {open &&
              options.map((o, i) => (
                <li
                  key={o.id}
                  id={optionId(i)}
                  role="option"
                  aria-selected={i === active}
                  className={`flex min-h-[44px] cursor-pointer flex-col justify-center px-3 py-2 hover:bg-surface ${i === active ? 'bg-surface outline outline-2 -outline-offset-2 outline-accent-700' : ''}`}
                  // Keeps focus in the input, so choosing never fires a blur first.
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => choose(o)}
                >
                  <span className="font-semibold">{o.mainText}</span>
                  {o.secondaryText && (
                    <>
                      <span className="sr-only">, </span>
                      <span className="gg-hint">{o.secondaryText}</span>
                    </>
                  )}
                </li>
              ))}
          </ul>
          <div role="status" aria-live="polite" className="sr-only">
            {announcement}
          </div>
        </>
      )}
    </div>
  );
}
