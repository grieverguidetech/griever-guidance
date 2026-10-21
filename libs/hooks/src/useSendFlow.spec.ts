import { act, renderHook } from '@testing-library/react';
import type { SessionDetails } from '@griever/shared';
import { freshDraft, hasDraftInProgress, isDraftStarted, resumeDraft, useSendFlow, type SendFlowDraft } from './useSendFlow.js';
import { stripSentWording } from './useSessions.js';

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
  it('goes from the announcement straight to the people, with no service question', () => {
    const { result } = announcement();
    expect(result.current.steps).toEqual(['template', 'announce', 'contacts', 'review', 'sending', 'sent']);
    act(() => result.current.nextStep());
    expect(result.current.step).toBe('contacts');
  });

  it('says details will follow when the session has no service details', () => {
    const { result } = announcement();
    expect(result.current.composedMessage).toContain('Details of the service will follow');
    expect(result.current.composedFields['serviceDetailsKnown']).toBe('no');
  });

  it('includes the service line when the session has a service date', () => {
    const withService = { ...session, serviceDate: 'June 5' } as SessionDetails;
    const { result } = renderHook(() =>
      useSendFlow({ session: withService, draft: freshDraft({ templateCategory: 'announcement', step: 'announce' }) }),
    );
    expect(result.current.composedFields['serviceDetailsKnown']).toBe('yes');
    expect(result.current.composedMessage).toContain('The service will be held June 5.');
    expect(result.current.composedMessage).not.toContain('will follow');
  });

  it('resumes a draft saved on the retired serviceKnown step on the people step', () => {
    const { result } = announcement({ step: 'serviceKnown' });
    expect(result.current.step).toBe('contacts');
  });

  it('resumes an old announcement draft on the details step on the people step, keeping what was typed', () => {
    const { result } = announcement({
      step: 'details',
      serviceDetailsKnown: 'yes',
      fields: { serviceDate: 'June 7', serviceLocation: 'Oak Chapel' },
    });
    expect(result.current.step).toBe('contacts');
    expect(result.current.composedMessage).toContain('June 7');
    expect(result.current.composedMessage).toContain('Oak Chapel');
  });

  it('composes the message from the session, so names are typed once', () => {
    const { result } = announcement();
    expect(result.current.composedMessage).toContain('Margaret Hayes passed away on May 29, 2026');
    expect(result.current.composedMessage).toContain('— Peter');
  });

  it('walks forward and back through the step order', () => {
    const { result } = announcement();
    act(() => result.current.nextStep());
    expect(result.current.step).toBe('contacts');
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

describe('useSendFlow — an edited message', () => {
  it('keeps the edit when flowers change', () => {
    const { result } = announcement();
    act(() => result.current.setMessageOverride('my words'));
    act(() => result.current.setIncludeFlowers(true));
    act(() => result.current.setFlorist('f-1'));
    act(() => result.current.setCustomFlorist('Rose Shop'));
    act(() => result.current.setFlowerDeliveryTarget('home'));
    expect(result.current.composedMessage).toBe('my words');
  });

  it('treats an emptied message as blank, not as the template', () => {
    const { result } = announcement();
    act(() => result.current.setMessageOverride(''));
    expect(result.current.composedMessage).toBe('');
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

});

describe('useSendFlow — storage fallback', () => {
  it('survives unreadable storage', () => {
    const storage = { getItem: () => '{not json', setItem: vi.fn(), removeItem: vi.fn() };
    const { result } = renderHook(() => useSendFlow({ storage }));
    expect(result.current.step).toBe('template');
  });
});

describe('hasDraftInProgress', () => {
  it('is true once a template is chosen and the message is not yet sent', () => {
    expect(hasDraftInProgress(freshDraft({ templateCategory: 'service', step: 'details' }))).toBe(true);
  });

  it('is false with no draft, no template yet, or a finished message', () => {
    expect(hasDraftInProgress(null)).toBe(false);
    expect(hasDraftInProgress(freshDraft({}))).toBe(false);
    expect(hasDraftInProgress(freshDraft({ templateCategory: 'announcement', step: 'sent' }))).toBe(false);
  });

  it('is false while sending, because the send job is not saved', () => {
    expect(hasDraftInProgress(freshDraft({ templateCategory: 'announcement', step: 'sending' }))).toBe(false);
  });
});

describe('isDraftStarted', () => {
  it('is false for no draft, a draft only opened, and a finished one', () => {
    expect(isDraftStarted(undefined)).toBe(false);
    expect(isDraftStarted(freshDraft({ templateCategory: 'announcement', step: 'announce' }))).toBe(false);
    expect(isDraftStarted(freshDraft({ templateCategory: 'service', step: 'details' }))).toBe(false);
    expect(isDraftStarted(freshDraft({ templateCategory: 'announcement', step: 'sent' }))).toBe(false);
  });

  it('is true once words are typed or the draft is past its first form', () => {
    expect(isDraftStarted(freshDraft({ templateCategory: 'announcement', step: 'announce', fields: { personalNote: 'x' } }))).toBe(true);
    expect(isDraftStarted(freshDraft({ templateCategory: 'announcement', step: 'contacts' }))).toBe(true);
    expect(isDraftStarted(freshDraft({ templateCategory: 'aftercare', step: 'review' }))).toBe(true);
  });
});

describe('resuming', () => {
  it('moves a draft off the template picker to the first form, keeping its fields', () => {
    const draft = freshDraft({ templateCategory: 'announcement', step: 'template', fields: { personalNote: 'hi' } });
    expect(resumeDraft(draft)).toMatchObject({ step: 'announce', fields: { personalNote: 'hi' } });
    expect(resumeDraft({ ...draft, templateCategory: 'service' }).step).toBe('details');
  });

  it('resumes an obituary on its recipients, since it has no details form', () => {
    expect(resumeDraft(freshDraft({ templateCategory: 'obituary', step: 'template' })).step).toBe('contacts');
  });

  it("brings a moment's own saved draft back when the picker chooses it (#83)", () => {
    const saved = freshDraft({ templateCategory: 'announcement', step: 'review', fields: { personalNote: 'hi' }, selectedContactIds: ['c1'] });
    const { result } = renderHook(() =>
      useSendFlow({ session, draft: freshDraft({ templateCategory: 'service', step: 'template' }), drafts: { announcement: saved } }),
    );
    act(() => result.current.setTemplateCategory('announcement'));
    expect(result.current).toMatchObject({ step: 'template', fields: { personalNote: 'hi' }, selectedContactIds: ['c1'] });
    act(() => result.current.nextStep());
    expect(result.current.step).toBe('announce');
  });

  it('starts blank when the chosen moment has no draft in progress', () => {
    const sent = freshDraft({ templateCategory: 'announcement', step: 'sent', selectedContactIds: ['c1'] });
    const { result } = renderHook(() => useSendFlow({ session, drafts: { announcement: sent } }));
    act(() => result.current.setTemplateCategory('announcement'));
    expect(result.current.selectedContactIds).toEqual([]);
  });

  it('leaves a draft that is past the picker alone', () => {
    const draft = freshDraft({ templateCategory: 'announcement', step: 'contacts' });
    expect(resumeDraft(draft)).toBe(draft);
  });

  it('keeps what was typed when the same category is chosen again', () => {
    const { result } = announcement({ step: 'template', fields: { personalNote: 'hi' } });
    act(() => result.current.setTemplateCategory('announcement'));
    expect(result.current.fields).toEqual({ personalNote: 'hi' });
    act(() => result.current.setTemplateCategory('service'));
    expect(result.current.fields).toEqual({});
  });
});

describe('useSendFlow — start again (#98)', () => {
  it('reports content only when something is typed, edited or chosen', () => {
    const { result } = announcement();
    expect(result.current.hasDraftContent).toBe(false);
    act(() => result.current.setField('personalNote', '  '));
    expect(result.current.hasDraftContent).toBe(false);
    act(() => result.current.setField('personalNote', 'hi'));
    expect(result.current.hasDraftContent).toBe(true);
  });

  it('empties the moment and returns to its first form, keeping the moment', () => {
    const { result } = announcement({ step: 'review', fields: { personalNote: 'hi' }, selectedContactIds: ['c-1'], messageOverride: 'mine' });
    act(() => result.current.startAgain());
    expect(result.current).toMatchObject({ step: 'announce', templateCategory: 'announcement', fields: {}, selectedContactIds: ['c-1'], messageOverride: null });
    expect(result.current.hasDraftContent).toBe(false);
  });

  it('ignores contacts on forms that do not show them, but counts them on the obituary', () => {
    const service = renderHook(() => useSendFlow({ session, draft: freshDraft({ templateCategory: 'service', step: 'details', selectedContactIds: ['c-1'] }) }));
    expect(service.result.current.hasDraftContent).toBe(false);
    const obit = renderHook(() => useSendFlow({ session, draft: freshDraft({ templateCategory: 'obituary', step: 'contacts', selectedContactIds: ['c-1'] }) }));
    expect(obit.result.current.hasDraftContent).toBe(true);
  });

  it('goes to the details form for a service and the contacts step for the obituary', () => {
    const service = renderHook(() => useSendFlow({ session, draft: freshDraft({ templateCategory: 'service', step: 'review', fields: { serviceLocation: 'x' } }) }));
    act(() => service.result.current.startAgain());
    expect(service.result.current.step).toBe('details');
    const obit = renderHook(() => useSendFlow({ session, draft: freshDraft({ templateCategory: 'obituary', templateOverrideId: 'obituary-link', step: 'contacts', selectedContactIds: ['c-1'] }) }));
    act(() => obit.result.current.startAgain());
    expect(obit.result.current).toMatchObject({ step: 'contacts', selectedContactIds: [], templateOverrideId: 'obituary-link' });
  });
});

// Characterization (#167): passes before and after the fix. It pins the contract the web app relies
// on when the flow is mounted again at Sent: a saved sent draft mounts at 'sent', not the picker.
describe('useSendFlow — mounted again with the saved sent draft (#167)', () => {
  it('keeps step "sent" and has no send job or wording', () => {
    // The draft as the app stores it after a send (useSessions.updateDraft strips it, C2).
    const draft = stripSentWording(
      freshDraft({
        templateCategory: 'announcement',
        step: 'sent',
        serviceDetailsKnown: 'no',
        selectedContactIds: ['c-1'],
        fields: { personalNote: 'private words' },
        messageOverride: 'private words',
      }),
    );
    const { result } = renderHook(() => useSendFlow({ session, draft }));
    expect(result.current).toMatchObject({
      step: 'sent',
      templateCategory: 'announcement',
      selectedContactIds: ['c-1'],
      sendJob: null,
      fields: {},
      messageOverride: null,
    });
    expect(result.current.composedMessage).not.toContain('private words');
    // Still not something Home reopens.
    expect(hasDraftInProgress(draft)).toBe(false);
  });
});
