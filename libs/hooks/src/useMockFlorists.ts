import { useMemo } from 'react';
import type { Florist, Place } from '@griever/shared';

/**
 * Stand-in for a Places "nearby search" (type: florist) ranked by distance
 * from the service venue. Returns a small canned list; swap the body for the
 * real request, keep the shape.
 */
const CANNED_FLORISTS: Florist[] = [
  {
    id: 'gg-elm-street-flowers',
    name: 'Elm Street Flowers',
    distanceLabel: '0.2 mi',
    deliveryHint: 'delivers to the chapel',
  },
  {
    id: 'gg-waltham-garden-co',
    name: 'Waltham Garden Co.',
    distanceLabel: '1.1 mi',
    deliveryHint: 'same-day delivery',
  },
];

export function useMockFlorists(place: Place | null): Florist[] {
  return useMemo(() => (place ? CANNED_FLORISTS : []), [place]);
}
