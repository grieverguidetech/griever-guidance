import { announcementPrefill, thanksPrefill } from './messagePrefill';

describe('messagePrefill', () => {
  it('the announcement prefill fills in the name and the date', () => {
    const text = announcementPrefill({ personName: 'Margaret Hayes', dateOfPassing: '2026-05-29' });
    expect(text).toContain('Margaret Hayes');
    expect(text).not.toContain('our loved one');
    expect(text).toContain('2026');
  });

  it('with no name, both prefills use "our loved one"', () => {
    expect(announcementPrefill({ dateOfPassing: '2026-05-29' })).toContain('our loved one');
    expect(thanksPrefill({ personName: '   ' })).toContain('our loved one');
  });

  it('the thanks prefill fills in the name', () => {
    const text = thanksPrefill({ personName: 'Margaret Hayes' });
    expect(text).toContain('Margaret Hayes');
    expect(text).not.toContain('{deceasedName}');
  });
});
