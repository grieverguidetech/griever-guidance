import { describe, expect, it } from 'vitest';
import {
  ALLOWED_PLACE_TYPES,
  BURIAL_PLACE_TYPES,
  FUNERAL_HOME_PLACE_TYPES,
  PLACE_TYPES_MAX,
  SERVICE_PLACE_TYPES,
  WORSHIP_PLACE_TYPES,
} from './places.js';

describe('place types', () => {
  it('allows the union of the service and burial lists', () => {
    expect([...ALLOWED_PLACE_TYPES].sort()).toEqual([...SERVICE_PLACE_TYPES, ...BURIAL_PLACE_TYPES].sort());
  });

  it('builds the service list from the funeral home and worship lists, unchanged', () => {
    expect(FUNERAL_HOME_PLACE_TYPES).toEqual(['funeral_home']);
    expect(WORSHIP_PLACE_TYPES).toEqual(['church', 'synagogue', 'mosque', 'hindu_temple']);
    expect(SERVICE_PLACE_TYPES).toEqual(['funeral_home', 'church', 'synagogue', 'mosque', 'hindu_temple']);
    expect([...ALLOWED_PLACE_TYPES]).toEqual([
      'funeral_home', 'church', 'synagogue', 'mosque', 'hindu_temple', 'cemetery',
    ]);
  });

  it('keeps each list within what one request takes', () => {
    expect(SERVICE_PLACE_TYPES.length).toBeLessThanOrEqual(PLACE_TYPES_MAX);
    expect(BURIAL_PLACE_TYPES.length).toBeLessThanOrEqual(PLACE_TYPES_MAX);
  });
});
