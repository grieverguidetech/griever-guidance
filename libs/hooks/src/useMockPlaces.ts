import { useEffect, useState } from 'react';
import type { Place } from '@griever/shared';

/**
 * Stand-in for Google Places Autocomplete. The real integration lives behind
 * this hook's signature — swap the body, keep the shape. Never blocks sending:
 * callers fall back to the raw typed text if nothing is picked.
 */
const CANNED_PLACES: Place[] = [
  {
    placeId: 'gg-riverside-chapel',
    name: 'Riverside Chapel',
    formattedAddress: '40 Elm St, Waltham, MA 02451',
  },
  {
    placeId: 'gg-riverside-chapel-cemetery',
    name: 'Riverside Chapel Cemetery',
    formattedAddress: '112 Riverside Ave, Newton, MA 02458',
  },
  {
    placeId: 'gg-riverside-funeral-home',
    name: 'Riverside Funeral Home',
    formattedAddress: '8 Bridge St, Watertown, MA 02472',
  },
  {
    placeId: 'gg-st-marys-church',
    name: "St. Mary's Church",
    formattedAddress: '42 Oak St, Boston, MA 02118',
  },
  {
    placeId: 'gg-the-riverside-club',
    name: 'The Riverside Club',
    formattedAddress: '88 Harbor Rd, Portland, ME 04101',
  },
];

const DEBOUNCE_MS = 250;

export function useMockPlaces(query: string): Place[] {
  const [results, setResults] = useState<Place[]>([]);

  useEffect(() => {
    const trimmed = query.trim().toLowerCase();
    if (trimmed.length < 2) {
      setResults([]);
      return;
    }
    const timer = setTimeout(() => {
      setResults(
        CANNED_PLACES.filter(
          (p) =>
            p.name.toLowerCase().includes(trimmed) ||
            p.formattedAddress.toLowerCase().includes(trimmed),
        ),
      );
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query]);

  return results;
}
