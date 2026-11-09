import { buildObituaryDraft, screenCopy } from '../../copy/src/index.js';
import { ageFrom } from './obituaryPeople.js';

// The obituary builder (libs/copy) has its own date reader, because copy cannot import shared.
// This keeps it equal to ageFrom for every pair below.
const PAIRS: [birth: string, death: string][] = [
  ['March 2, 1941', 'June 7, 2025'],
  ['June 7, 1941', 'June 7, 2025'],
  ['June 8, 1941', 'June 7, 2025'],
  ['2025-06-07', 'June 7, 2025'],
  ['6/7/1941', '2025-06-07'],
  ['1/5/1941', '5/1/2025'],
  ['Jan 5, 1941', 'Sept. 5, 2025'],
  ['Sept 5 1941', 'Sep 5, 2025'],
  ['January 5, 1941', 'December 31, 2025'],
  ['Janu 5, 1941', 'June 7, 2025'],
  ['Janua 5, 1941', 'June 7, 2025'],
  ['Mar. 2, 1941', 'Jun. 7, 2025'],
  ['Sepa 5, 1941', 'June 7, 2025'],
  ['Foo 5, 1941', 'June 7, 2025'],
  ['Feb 30, 1941', 'June 7, 2025'],
  ['Feb 29, 1944', 'Feb 28, 2025'],
  ['Feb 29, 2023', 'Feb 28, 2025'],
  ['June 8, 2025', 'June 7, 2025'],
  ['June 7, 1799', 'June 7, 2025'],
  ['June 7, 1800', 'June 7, 2025'],
  ['June 7, 2025', 'June 7, 2101'],
  ['1941', 'June 7, 2025'],
  ['March 2', 'June 7, 2025'],
  ['March 2, 1941', 'June 7'],
  ['', 'June 7, 2025'],
  ['March 2, 1941', ''],
  ['  March 2, 1941  ', ' June 7, 2025 '],
  ['march 2, 1941', 'JUNE 7, 2025'],
  ['2025-6-7', 'June 7, 2025'],
];

describe('the obituary builder reads ages as ageFrom does', () => {
  const copy = screenCopy('obituaryDraft');

  it.each(PAIRS)('%j to %j', (birthDate, dateOfPassing) => {
    const expected = ageFrom(birthDate, dateOfPassing) || '[AGE]';
    const first = buildObituaryDraft({ birthDate, dateOfPassing, obituaryGivenName: 'A', obituarySurname: 'B' }, copy).split('\n\n')[0];
    expect(first.startsWith(`A B, ${expected}, of `), first).toBe(true);
  });
});
