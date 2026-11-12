import { useEffect, useId, useRef, useState } from 'react';
import { fill, screenCopy } from '@griever/copy';
import { usePlaces } from './PlacesContext';
import type { PlaceDetails, PlaceSuggestion, PlacesToken } from './placesClient';

const copy = screenCopy('cmsService');

export const PLACE_DEBOUNCE_MS = 300;
export const PLACE_MIN_CHARS = 3;
/** A search still running after this long is announced. Faster ones are not, so typing is not interrupted. */
export const PLACE_SLOW_MS = 1000;
/** Details slower than this are given up on; the pick then uses the prediction text. */
export const PLACE_DETAILS_TIMEOUT_MS = 3000;

/** The polite announcement for a number of suggestions. */
export const countText = (n: number): string =>
  n === 0 ? copy.placesNone : n === 1 ? copy.placesOne : fill(copy.placesMany, { count: n });

export interface PlaceInputProps {
  id: string;
  /** Ids of the elements that name the field, as for a plain input. */
  labelledBy: string;
  /** Ids of the elements that describe the field (a hint). */
  describedBy?: string;
  /** The longest text the field accepts, as for a plain input. */
  maxLength?: number;
  /** The polite status after a pick that also filled another field. Defaults to the Service text. */
  fillMessage?: string;
  /** Set: the polite status after a pick says this, with {name} replaced by the picked name. Without it, a pick that fills nothing else says nothing. */
  pickedMessage?: string;
  value: string;
  onChange: (value: string) => void;
  /** Google place types to suggest. Without them the field is a plain text input. */
  types?: readonly string[];
  /**
   * Asked on a pick, before the details call (which is billed). Return false when the address will not
   * be used; onPick then gets null details. Without it, details are always fetched.
   */
  wantsDetails?: (suggestion: PlaceSuggestion) => boolean;
  /**
   * Takes over a pick, to fill more than this field. Without it a pick sets the value to the whole line.
   * Gets the full details (name and street address) fetched for the pick, or null when that failed;
   * then fall back to the suggestion. Return true when it also filled another field; the status then says so.
   */
  onPick?: (suggestion: PlaceSuggestion, details: PlaceDetails | null) => boolean | void;
}

/**
 * A text field that can suggest places (WAI-ARIA combobox with a listbox popup, list autocomplete).
 * The typed text is always the value. Suggestions only help; with none available, or on any
 * failure, it behaves as a plain input and shows no error.
 */
export function PlaceInput({ id, labelledBy, describedBy, maxLength, fillMessage, pickedMessage, value, onChange, types, onPick, wantsDetails }: PlaceInputProps) {
  const { enabled, load } = usePlaces();
  // Set when Google could not load. The field then drops every combobox attribute.
  const [unavailable, setUnavailable] = useState(false);
  const suggesting = enabled && types !== undefined && !unavailable;
  const listId = `${useId()}-list`;
  const [options, setOptions] = useState<PlaceSuggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [announcement, setAnnouncement] = useState('');
  // True while a search runs. The list then shows one "Searching…" row; "empty" shows "No matches".
  const [searching, setSearching] = useState(false);
  const [empty, setEmpty] = useState(false);
  // True while the details of a pick load.
  const [picking, setPicking] = useState(false);
  const slowTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Bumped on every keystroke and pick, so details that arrive after the user moved on are dropped.
  const pickTicket = useRef(0);
  const onPickRef = useRef(onPick);
  onPickRef.current = onPick;
  const wantsRef = useRef(wantsDetails);
  wantsRef.current = wantsDetails;
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
      if (slowTimer.current) {
        clearTimeout(slowTimer.current);
      }
      request.current += 1;
      // A pick still waiting for its details must not write after the field is gone.
      pickTicket.current += 1;
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
    if (slowTimer.current) {
      clearTimeout(slowTimer.current);
    }
  };

  const hideList = () => {
    setOpen(false);
    setActive(-1);
    setSearching(false);
    setEmpty(false);
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
    setSearching(true);
    setEmpty(false);
    setOpen(false);
    setActive(-1);
    setAnnouncement('');
    slowTimer.current = setTimeout(() => {
      if (ticket === request.current) {
        setAnnouncement(copy.placesSearching);
      }
    }, PLACE_SLOW_MS);
    try {
      const client = await load();
      if (ticket !== request.current) {
        return;
      }
      if (!client) {
        setUnavailable(true);
        setSearching(false);
        setAnnouncement('');
        return;
      }
      token.current ??= client.newToken();
      const found = await client.suggest(text, types, token.current);
      if (ticket !== request.current) {
        return;
      }
      clearTimeout(slowTimer.current ?? undefined);
      setOptions(found);
      setActive(-1);
      setSearching(false);
      setEmpty(found.length === 0);
      setOpen(found.length > 0);
      setAnnouncement(countText(found.length));
    } catch {
      // Suggestions are a convenience. A failure leaves a plain field and says nothing.
      if (ticket === request.current) {
        hideList();
        setAnnouncement('');
      }
    } finally {
      // A fast failure or an unavailable client must not announce "Searching…" later.
      if (ticket === request.current) {
        clearTimeout(slowTimer.current ?? undefined);
      }
    }
  };

  const handleChange = (text: string) => {
    onChange(text);
    pickTicket.current += 1;
    setPicking(false);
    cancelPending();
    setActive(-1);
    if (!suggesting || text.trim().length < PLACE_MIN_CHARS) {
      hideList();
      setOptions([]);
      setAnnouncement('');
      return;
    }
    const ticket = request.current;
    timer.current = setTimeout(() => void search(text.trim(), ticket), PLACE_DEBOUNCE_MS);
  };

  const choose = async (option: PlaceSuggestion) => {
    if (!onPick) {
      onChange(option.text);
      stop();
      setOptions([]);
      return;
    }
    // Cut to the field's limit first, so no change ever goes over it.
    const name = maxLength === undefined ? option.mainText : option.mainText.slice(0, maxLength);
    // Show the place name at once; the full address follows when the details arrive.
    onChange(name);
    stop();
    setOptions([]);
    pickTicket.current += 1;
    const ticket = pickTicket.current;
    setPicking(true);
    // The name and full address come from the place itself; the prediction only has a short line.
    let details: PlaceDetails | null = null;
    if (wantsRef.current?.(option) ?? true) {
      let giveUp: ReturnType<typeof setTimeout> | undefined;
      try {
        const client = await load();
        const slow = new Promise<null>((resolve) => {
          giveUp = setTimeout(() => resolve(null), PLACE_DETAILS_TIMEOUT_MS);
        });
        details = client ? await Promise.race([client.details(option), slow]) : null;
      } catch {
        details = null;
      }
      clearTimeout(giveUp);
    }
    // Typing again, or a newer pick, while the details loaded means the user moved on.
    if (ticket !== pickTicket.current) {
      return;
    }
    setPicking(false);
    if (onPickRef.current?.(option, details) === true) {
      setAnnouncement(fillMessage ?? copy.placesAddressFilled);
    } else if (pickedMessage) {
      setAnnouncement(fill(pickedMessage, { name }));
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown' && !open && !searching && options.length > 0) {
      e.preventDefault();
      setOpen(true);
      setActive(0);
      setAnnouncement(countText(options.length));
      return;
    }
    if (e.key === 'Escape' && (open || searching || empty)) {
      e.preventDefault();
      e.stopPropagation();
      stop();
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
      void choose(options[active]);
    }
  };

  const optionId = (i: number) => `${listId}-${i}`;
  const listVisible = open || searching || empty;
  const comboboxProps = suggesting
    ? {
        role: 'combobox',
        'aria-autocomplete': 'list' as const,
        'aria-expanded': listVisible,
                'aria-controls': listId,
        'aria-activedescendant': open && active >= 0 ? optionId(active) : undefined,
      }
    : {};

  return (
    <div className="relative">
      <input
        id={id}
        aria-labelledby={labelledBy}
        aria-describedby={describedBy}
        maxLength={maxLength}
        type="text"
        {...comboboxProps}
        className={`gg-input ${suggesting ? 'pe-9' : ''}`}
        autoComplete="off"
        value={value}
        onChange={(e) => handleChange(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={stop}
      />
      {(searching || picking) && <span aria-hidden="true" className="gg-spinner absolute right-3 top-1/2 -mt-2" />}
      {suggesting && (
        <>
          <ul
            id={listId}
            role="listbox"
            aria-label={copy.placesListLabel}
            hidden={!listVisible}
            aria-busy={searching || picking}
            className="absolute left-0 right-0 z-10 m-0 mt-1 max-h-72 list-none overflow-auto rounded-md border border-neutral-600 bg-bg p-0"
          >
            {searching && (
              <li role="option" aria-disabled="true" aria-selected={false} className="gg-hint flex min-h-[44px] items-center px-3 py-2">
                {copy.placesSearching}
              </li>
            )}
            {empty && !searching && (
              <li role="option" aria-disabled="true" aria-selected={false} className="gg-hint flex min-h-[44px] items-center px-3 py-2">
                {copy.placesNone}
              </li>
            )}
            {open &&
              !searching &&
              options.map((o, i) => (
                <li
                  key={o.id}
                  id={optionId(i)}
                  role="option"
                  aria-selected={i === active}
                  className={`flex min-h-[44px] cursor-pointer flex-col justify-center px-3 py-2 hover:bg-surface ${i === active ? 'bg-surface outline outline-2 -outline-offset-2 outline-accent-700' : ''}`}
                  // Keeps focus in the input, so choosing never fires a blur first.
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => void choose(o)}
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
