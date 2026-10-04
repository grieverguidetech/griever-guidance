import { act, renderHook } from '@testing-library/react';
import type { SessionDetails } from '@griever/shared';
import { freshDraft, useSendFlow, type SendFlowDraft } from './useSendFlow.js';

const session: SessionDetails = {
  personName: 'Margaret Hayes',
  dateOfPassing: 'May 29, 2026',
  senderName: 'Peter',
  obituaryUrl: '',
  obituaryPublisher: '',
  serviceDate: '',
} as SessionDetails;

function announcement(patch: Partial<SendFlowDraft> = {}) {
  return renderHook(() =>
    useSendFlow({ session, draft: freshDraft({ templateCategory: 'announcement', step: 'announce', ...patch }) }),
  );
}

describe('useSendFlow — announcement path', () => {
  it('skips the details step when the service is not known', () => {
    const { result } = announcement();
    act(() => result.current.setServiceDetailsKnown('no'));
    expect(result.current.steps).toEqual(['template', 'announce', 'serviceKnown', 'contacts', 'review', 'sending', 'sent']);
  });

  it('asks for details when the griever has them', () => {
    const { result } = announcement();
    act(() => result.current.setServiceDetailsKnown('yes'));
    expect(result.current.steps).toContain('details');
  });

  it('composes the message from the session, so names are typed once', () => {
    const { result } = announcement();
    expect(result.current.composedMessage).toContain('Margaret Hayes passed away on May 29, 2026');
    expect(result.current.composedMessage).toContain('— Peter');
  });

  it('walks forward and back through the step order', () => {
    const { result } = announcement();
    act(() => result.current.nextStep());
    expect(result.current.step).toBe('serviceKnown');
    act(() => result.current.prevStep());
    expect(result.current.step).toBe('announce');
  });

  it('drops a hand-edited message when a fact changes, so it cannot go stale', () => {
    const { result } = announcement();
    act(() => result.current.setMessageOverride('custom words'));
    expect(result.current.composedMessage).toBe('custom words');
    act(() => result.current.setTone('softer'));
    expect(result.current.messageOverride).toBeNull();
    expect(result.current.composedMessage).toMatch(/^It is with love/);
  });
});

describe('useSendFlow — sending one contact at a time', () => {
  function readyToSend() {
    const hook = announcement({ step: 'review' });
    act(() => hook.result.current.selectContacts(['a', 'b', 'c']));
    act(() => hook.result.current.startSendJob());
    return hook;
  }

  it('makes only the first recipient active', () => {
    const { result } = readyToSend();
    expect(result.current.step).toBe('sending');
    expect(result.current.sendJob?.recipients.map((r) => r.status)).toEqual(['sending', 'queued', 'queued']);
  });

  it('advances through sent and skipped, then lands on sent', () => {
    const { result } = readyToSend();
    act(() => result.current.markActiveSent());
    act(() => result.current.markActiveSkipped());
    expect(result.current.step).toBe('sending');
    act(() => result.current.markActiveSent());
    expect(result.current.sendJob?.recipients.map((r) => r.status)).toEqual(['delivered', 'skipped', 'delivered']);
    expect(result.current.step).toBe('sent');
  });

  it('never restores an in-progress send job from a draft (C2: nothing kept after send)', () => {
    const { result } = renderHook(() =>
      useSendFlow({ session, draft: freshDraft({ templateCategory: 'announcement', step: 'sending' }) }),
    );
    expect(result.current.step).toBe('review');
    expect(result.current.sendJob).toBeNull();
  });

  it('reports drafts without the send job', () => {
    const onDraftChange = vi.fn();
    const { result } = renderHook(() =>
      useSendFlow({ session, draft: freshDraft({ templateCategory: 'announcement', step: 'review' }), onDraftChange }),
    );
    act(() => result.current.selectContacts(['a']));
    act(() => result.current.startSendJob());
    const last = onDraftChange.mock.calls.at(-1)?.[0];
    expect(last.step).toBe('sending');
    expect(last).not.toHaveProperty('sendJob');
  });
});

describe('useSendFlow — contacts', () => {
  it('toggles and de-duplicates selections', () => {
    const { result } = announcement({ step: 'contacts' });
    act(() => result.current.toggleContact('a'));
    act(() => result.current.selectContacts(['a', 'b']));
    expect(result.current.selectedContactIds).toEqual(['a', 'b']);
    act(() => result.current.toggleContact('a'));
    expect(result.current.selectedContactIds).toEqual(['b']);
  });

  it('keeps the same people when moving on to the service details', () => {
    const { result } = announcement({ step: 'sent', selectedContactIds: ['a', 'b'] });
    act(() => result.current.restartForServiceDetails());
    expect(result.current.step).toBe('details');
    expect(result.current.templateCategory).toBe('service');
    expect(result.current.selectedContactIds).toEqual(['a', 'b']);
  });
});

describe('useSendFlow — storage fallback', () => {
  it('survives unreadable storage', () => {
    const storage = { getItem: () => '{not json', setItem: vi.fn(), removeItem: vi.fn() };
    const { result } = renderHook(() => useSendFlow({ storage }));
    expect(result.current.step).toBe('template');
  });
});
