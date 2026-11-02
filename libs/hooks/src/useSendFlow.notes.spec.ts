import { act, renderHook } from '@testing-library/react';
import type { SessionDetails } from '@griever/shared';
import { freshDraft, useSendFlow, type SendFlowDraft } from './useSendFlow.js';

const session = {
  personName: 'Margaret Hayes',
  dateOfPassing: 'May 29, 2026',
  senderName: 'Peter',
  obituaryUrl: '',
  obituaryPublisher: '',
  serviceDate: '',
} as SessionDetails;

function flow(patch: Partial<SendFlowDraft> = {}) {
  return renderHook(() =>
    useSendFlow({ session, draft: freshDraft({ templateCategory: 'aftercare', step: 'review', selectedContactIds: ['c1', 'c2'], ...patch }) }),
  );
}

describe('useSendFlow recipient notes', () => {
  it('adds the note as the last line, after the greeting and message', () => {
    const { result } = flow();
    act(() => result.current.setRecipientNote('c1', 'Thank you for the lasagna'));
    expect(result.current.messageFor('Anna Lee', 'c1')).toBe(`Anna,\n${result.current.composedMessage}\nThank you for the lasagna`);
  });

  it('leaves other people and calls without a contact id alone', () => {
    const { result } = flow();
    act(() => result.current.setRecipientNote('c1', 'Thank you for the lasagna'));
    expect(result.current.messageFor('Ben Ray', 'c2')).toBe(`Ben,\n${result.current.composedMessage}`);
    expect(result.current.messageFor('Anna Lee')).toBe(`Anna,\n${result.current.composedMessage}`);
  });

  it('ignores a blank note and trims spaces', () => {
    const { result } = flow();
    act(() => result.current.setRecipientNote('c1', '   '));
    expect(result.current.messageFor('Anna Lee', 'c1')).toBe(`Anna,\n${result.current.composedMessage}`);
    act(() => result.current.setRecipientNote('c1', '  Thanks  '));
    expect(result.current.messageFor('Anna Lee', 'c1').endsWith('\nThanks')).toBe(true);
  });

  it('is not added for other moments', () => {
    const { result } = flow({ templateCategory: 'announcement' });
    act(() => result.current.setRecipientNote('c1', 'Thanks'));
    expect(result.current.messageFor('Anna Lee', 'c1')).toBe(`Anna,\n${result.current.composedMessage}`);
  });

  it('clears the notes when the send finishes, not before', () => {
    const { result } = flow();
    act(() => result.current.startSendJob());
    act(() => result.current.setRecipientNote('c1', 'Thanks'));
    act(() => result.current.markActiveSent());
    expect(result.current.recipientNotes).toEqual({ c1: 'Thanks' });
    act(() => result.current.markActiveSkipped());
    expect(result.current.step).toBe('sent');
    expect(result.current.recipientNotes).toEqual({});
  });
});
