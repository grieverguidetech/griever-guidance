import { renderHook } from '@testing-library/react';
import { defaultServiceEventsMessage, type SessionDetails } from '@griever/shared';
import { freshDraft, useSendFlow } from './useSendFlow.js';

const session = {
  personName: 'Margaret Hayes',
  dateOfPassing: '',
  senderName: '',
  obituaryUrl: 'legacy.com/a',
  serviceDate: 'June 14',
  visitationPlace: 'Oak Funeral Home',
  visitationDate: 'June 13',
  burialPlace: 'Hillside Cemetery',
  receptionPlace: 'The parish hall',
} as SessionDetails;

const fields = { serviceDate: 'June 14', serviceTime: '2:00 PM', serviceLocation: 'St. Mary' };

function flow(category: 'service' | 'announcement', over: Partial<ReturnType<typeof freshDraft>> = {}) {
  return renderHook(() =>
    useSendFlow({ session, draft: freshDraft({ templateCategory: category, step: 'review', fields, ...over }) }),
  );
}

describe('useSendFlow service events (#961)', () => {
  it('builds the same message as the web preview when no wording is set', () => {
    const { result } = flow('service');
    const web = defaultServiceEventsMessage({
      ...session,
      serviceTime: '2:00 PM',
      servicePlace: 'St. Mary',
    });
    expect(result.current.composedMessage).toBe(web);
    expect(result.current.composedMessage).toContain('Visitation will be held at Oak Funeral Home on June 13.');
  });

  it('follows a changed phone detail', () => {
    const { result } = flow('service', { fields: { ...fields, serviceTime: '3:30 PM' } });
    expect(result.current.composedMessage).toContain('at 3:30 PM');
  });

  it('keeps text typed on the phone', () => {
    const { result } = flow('service', { messageOverride: 'My own words' });
    expect(result.current.composedMessage).toBe('My own words');
  });

  it('leaves the announcement without the events', () => {
    const { result } = flow('announcement');
    expect(result.current.composedMessage).not.toContain('Visitation');
  });
});
