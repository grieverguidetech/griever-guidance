import { BURIAL_PLACE_TYPES, SERVICE_PLACE_TYPES } from './placesClient';

// Pins the exact lists. Each must be a Table A type, and a request takes at most 5:
// https://developers.google.com/maps/documentation/places/web-service/place-types
describe('place types', () => {
  it('service places', () => {
    expect([...SERVICE_PLACE_TYPES]).toEqual(['funeral_home', 'church', 'synagogue', 'mosque', 'hindu_temple']);
    expect(SERVICE_PLACE_TYPES.length).toBeLessThanOrEqual(5);
  });
  it('burial places', () => {
    expect([...BURIAL_PLACE_TYPES]).toEqual(['cemetery']);
  });
});
