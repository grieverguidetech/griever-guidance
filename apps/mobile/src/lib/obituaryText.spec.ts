import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { buildObituaryDraft, screenCopy } from '@griever/copy';
import { obituaryTextFor } from './obituaryText';
import type { ObituaryTextSource } from './obituaryText';

const empty = { personName: '', dateOfPassing: '' } as ObituaryTextSource;

beforeEach(() => {
  jest.clearAllMocks();
});

describe('obituaryTextFor', () => {
  it('returns the hand-edited text when there is one', () => {
    expect(obituaryTextFor({ ...empty, personName: 'Anna', obituaryCity: 'Tulsa', obituaryText: ' Anna loved the garden. ' })).toBe(
      'Anna loved the garden.',
    );
  });

  it('builds the same draft as web from fields only', () => {
    const person = { ...empty, personName: 'Anna Lee', dateOfPassing: 'May 1, 2026', birthDate: 'June 2, 1950', obituaryCity: 'Tulsa', obituaryCareer: 'a nurse', obituarySurvivors: 'her sons', obituaryNote: 'She sang.' };
    const web = buildObituaryDraft(
      { fullName: 'Anna Lee', dateOfBirth: 'June 2, 1950', dateOfPassing: 'May 1, 2026', cityOfResidence: 'Tulsa', career: 'a nurse', survivors: 'her sons', personalNote: 'She sang.' },
      screenCopy('obituaryDraft'),
    );
    expect(obituaryTextFor(person)).toBe(web.trim());
    expect(web).toContain('Anna Lee');
  });

  it('returns empty when the person has no text and no fields', () => {
    expect(obituaryTextFor(empty)).toBe('');
  });

  it('returns empty when the text was edited down to blank', () => {
    expect(obituaryTextFor({ ...empty, personName: 'Anna', obituaryText: '   ' })).toBe('');
  });
});

describe('obituaryTextFor name only', () => {
  it('returns empty for a name with nothing else, so the calm line still shows', () => {
    expect(obituaryTextFor({ ...empty, personName: 'Anna' })).toBe('');
  });
});
