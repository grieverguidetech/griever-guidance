import { describe, expect, it } from 'vitest';
import {
  ALLOWED_PLACE_TYPES,
  BURIAL_PLACE_TYPES,
  PLACE_TYPES_MAX,
  SERVICE_PLACE_TYPES,
} from './places.js';

describe('place types', () => {
  it('allows the union of the service and burial lists', () => {
    expect([...ALLOWED_PLACE_TYPES].sort()).toEqual([...SERVICE_PLACE_TYPES, ...BURIAL_PLACE_TYPES].sort());
  });

  it('keeps each list within what one request takes', () => {
    expect(SERVICE_PLACE_TYPES.length).toBeLessThanOrEqual(PLACE_TYPES_MAX);
    expect(BURIAL_PLACE_TYPES.length).toBeLessThanOrEqual(PLACE_TYPES_MAX);
  });
});
