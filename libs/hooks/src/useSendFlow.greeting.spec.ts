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

function announcement(patch: Partial<SendFlowDraft> = {}, onDraftChange?: (d: SendFlowDraft) => void) {
  return renderHook(() =>
    useSendFlow({ session, onDraftChange, draft: freshDraft({ templateCategory: 'announcement', step: 'review', ...patch }) }),
  );
}

describe('useSendFlow greeting', () => {
  it('is on by default', () => {
    expect(announcement().result.current.greeting).toBe(true);
  });

  it('puts the first name on its own line above the message', () => {
    const { result } = announcement();
    expect(result.current.messageFor('Anna Lee')).toBe(`Anna,\n${result.current.composedMessage}`);
  });

  it('keeps the greeting on top of hand-edited words', () => {
    const { result } = announcement();
    act(() => result.current.setMessageOverride('My own words.'));
    expect(result.current.messageFor('Anna Lee')).toBe('Anna,\nMy own words.');
  });

  it('gives the plain message with the switch off', () => {
    const { result } = announcement();
    act(() => result.current.setGreeting(false));
    expect(result.current.messageFor('Anna Lee')).toBe(result.current.composedMessage);
  });

  it('gives the plain message when the name has nothing to greet', () => {
    const { result } = announcement();
    expect(result.current.messageFor('+16175550100')).toBe(result.current.composedMessage);
    expect(result.current.messageFor('')).toBe(result.current.composedMessage);
  });

  it('leaves composedMessage unchanged by the switch', () => {
    const { result } = announcement();
    const before = result.current.composedMessage;
    act(() => result.current.setGreeting(false));
    expect(result.current.composedMessage).toBe(before);
    act(() => result.current.setGreeting(true));
    expect(result.current.composedMessage).toBe(before);
    expect(before.startsWith('Anna')).toBe(false);
  });

  it('survives a draft round-trip, on and off', () => {
    const saved: SendFlowDraft[] = [];
    const first = announcement({}, (d) => saved.push(d));
    act(() => first.result.current.setGreeting(false));
    const off = saved[saved.length - 1];
    expect(off.greeting).toBe(false);
    expect(announcement(off).result.current.greeting).toBe(false);
    expect(announcement({ greeting: true }).result.current.greeting).toBe(true);
  });

  it('is on for an older draft saved without the field', () => {
    const { greeting: _g, ...old } = freshDraft({ templateCategory: 'announcement', step: 'review' });
    const { result } = renderHook(() => useSendFlow({ session, draft: old as SendFlowDraft }));
    expect(result.current.greeting).toBe(true);
  });
});
