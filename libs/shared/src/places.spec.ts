import { describe, expect, it } from 'vitest';
import {
  ALLOWED_PLACE_TYPES,
  BURIAL_PLACE_TYPES,
  CITY_PLACE_TYPES,
  cityPick,
  FUNERAL_HOME_PLACE_TYPES,
  PLACE_TYPES_MAX,
  SERVICE_PLACE_TYPES,
  WORSHIP_PLACE_TYPES,
} from './places.js';

describe('place types', () => {
  it('allows the union of the service and burial lists', () => {
    expect([...ALLOWED_PLACE_TYPES].sort()).toEqual(
      [...SERVICE_PLACE_TYPES, ...BURIAL_PLACE_TYPES, ...CITY_PLACE_TYPES].sort(),
    );
  });

  it('builds the service list from the funeral home and worship lists, unchanged', () => {
    expect(FUNERAL_HOME_PLACE_TYPES).toEqual(['funeral_home']);
    expect(WORSHIP_PLACE_TYPES).toEqual(['church', 'synagogue', 'mosque', 'hindu_temple']);
    expect(SERVICE_PLACE_TYPES).toEqual(['funeral_home', 'church', 'synagogue', 'mosque', 'hindu_temple']);
    expect([...ALLOWED_PLACE_TYPES]).toEqual([
      'funeral_home', 'church', 'synagogue', 'mosque', 'hindu_temple', 'cemetery', 'locality', 'postal_town',
    ]);
    expect(CITY_PLACE_TYPES).toEqual(['locality', 'postal_town']);
  });

  it('keeps each list within what one request takes', () => {
    expect(SERVICE_PLACE_TYPES.length).toBeLessThanOrEqual(PLACE_TYPES_MAX);
    expect(BURIAL_PLACE_TYPES.length).toBeLessThanOrEqual(PLACE_TYPES_MAX);
    expect(CITY_PLACE_TYPES.length).toBeLessThanOrEqual(PLACE_TYPES_MAX);
  });
});

describe('cityPick', () => {
  const city = (text: string, mainText: string, secondaryText: string) => ({ text, mainText, secondaryText });

  it('gives "City, State" and the state for a US city', () => {
    expect(cityPick(city('Springfield, IL', 'Springfield', 'IL'))).toEqual({
      display: 'Springfield, IL',
      state: 'IL',
    });
  });

  it('takes the last part of a longer secondary line', () => {
    expect(cityPick(city('Brooklyn, NY', 'Brooklyn', 'Kings County, NY'))).toEqual({
      display: 'Brooklyn, NY',
      state: 'NY',
    });
  });

  it('keeps the whole line and fills no state when the end is not a US state', () => {
    expect(cityPick(city('London, UK', 'London', 'UK'))).toEqual({ display: 'London, UK', state: '' });
    expect(cityPick(city('Paris', 'Paris', ''))).toEqual({ display: 'Paris', state: '' });
  });
});
