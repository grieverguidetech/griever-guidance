import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { AccessibilityInfo, BackHandler, Linking, Modal, StyleSheet } from 'react-native';
import { act, fireEvent, render, renderHook, screen, waitFor, within } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Session } from '@griever/hooks';
import { App, useSkipAnnounce } from './App';
import { SESSIONS_KEY } from '../lib/useDeviceSessions';

// Arriving on a moment opens Ready to send, never the people list. This presses the button that opens the list
// ("Choose who to tell", or "Change who gets this" when people are already picked) and waits for its heading.
const openPeople = async () => {
  fireEvent.press(await screen.findByRole('button', { name: /^(Choose who to tell|Change who gets this)/ }));
  return screen.findByRole('heading', { name: 'Who should get this?' });
};

// Jest has no native view tree, so findNodeHandle returns null. A fake handle lets the test see focus sent.
// This path is specific to this react-native version. Re-check it when react-native is upgraded.
// Each node gets its own handle, so a test can tell which node focus was sent to.
const mockHandles = new Map<unknown, number>();
const mockHandleFor = (node: unknown) => {
  if (!mockHandles.has(node)) {
    mockHandles.set(node, mockHandles.size + 1);
  }
  return mockHandles.get(node);
};
jest.mock('react-native/Libraries/ReactNative/RendererProxy', () => ({
  ...jest.requireActual<object>('react-native/Libraries/ReactNative/RendererProxy'),
  findNodeHandle: (node: unknown) => (node ? mockHandleFor(node) : null),
}));

const anna = {
  id: 'a', flowId: 'flow-a', ownerId: null, role: 'owner', personName: 'Anna', dateOfPassing: '', senderName: '', obituaryUrl: '',
  createdAt: '2026-10-01T00:00:00.000Z', lastOpenedAt: '2026-10-01T00:00:00.000Z',
  drafts: {}, serviceReady: false, recipientsNotified: {}, momentCompletedAt: {}, remindersScheduled: [],
} as unknown as Session;

const contacts = [
  { contactId: 'c1', name: 'Dee', phone: '+15555550100', tier: 'family' },
  { contactId: 'c2', name: 'Eli', phone: '+15555550101', tier: 'family' },
];

// A tap this soon after opening Messages is ignored (the double-tap guard), so a test waits like a person would.
// The test moves a clock by hand instead of waiting.
let clock = 1_700_000_000_000;
const afterMessages = async () => {
  clock += 1500;
};

beforeEach(() => {
  clock = 1_700_000_000_000;
  jest.spyOn(Date, 'now').mockImplementation(() => clock);
});

afterEach(() => {
  jest.restoreAllMocks();
});

const openAnna = async () => {
  await AsyncStorage.setItem(SESSIONS_KEY, JSON.stringify([anna]));
  await AsyncStorage.setItem('gg.contacts.v1', JSON.stringify(contacts));
  render(<App />);
  // The first App render in this file is slow on a loaded CI runner; give Home time to read storage.
  fireEvent.press(await screen.findByLabelText('Anna', {}, { timeout: 10000 }));
};

// The hub comes first: Start is the announcement; the other steps are rows named for the step.
const startMoment = async (title: string) =>
  fireEvent.press(
    await screen.findByRole('button', { name: title === 'Announce the passing' ? /^Announce the passing, .*Continue$/ : new RegExp(title) }),
  );

describe('picking an announcement', () => {
  it('opens on Ready to send with the people sheet closed, never the old intro or the checklist', async () => {
    await openAnna();
    await startMoment('Announce the passing');
    expect(await screen.findByRole('heading', { name: 'Announce the passing' })).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Who should get this?' })).toBeNull();
    await act(async () => new Promise((r) => setTimeout(r, 300)));
    expect(screen.queryByRole('heading', { name: 'Who should get this?' })).toBeNull();
    expect(await openPeople()).toBeTruthy();
    expect(screen.queryByText(/This is only if you'd like to say more/)).toBeNull();
    expect(screen.queryByLabelText(/Anything you'd like to add/)).toBeNull();
    expect(screen.queryByText('Gather when you can')).toBeNull();
  });

  it('puts the note typed under Add a personal note in the message, and keeps it on Change', async () => {
    await openAnna();
    await startMoment('Announce the passing');
    await openPeople();
    fireEvent.press(await screen.findByText('Dee'));
    fireEvent.press(screen.getByText(/^Done/));
    await screen.findByRole('heading', { name: 'Announce the passing' });
    expect(screen.queryByText(/She was peaceful\./)).toBeNull();
    fireEvent.press(screen.getByRole('button', { name: 'Add a personal note' }));
    fireEvent.changeText(await screen.findByLabelText("Anything you'd like to add (optional)"), 'She was peaceful.');
    expect(await screen.findByText(/She was peaceful\./)).toBeTruthy();
    // Going to the people and back keeps the note.
    fireEvent.press(screen.getByRole('button', { name: 'Change who gets this' }));
    await screen.findByText('Done · 1 chosen');
    fireEvent.press(screen.getByRole('button', { name: /^Done/ }));
    expect(await screen.findByText(/She was peaceful\./)).toBeTruthy();
  });

  it('lets people be picked on Who should get this?, and the picked people reach Review', async () => {
    await openAnna();
    await startMoment('Announce the passing');
    await openPeople();
    expect(await screen.findByText('Done')).toBeTruthy();
    fireEvent.press(await screen.findByRole('checkbox', { name: /Dee/ }));
    fireEvent.press(screen.getByRole('checkbox', { name: /Eli/ }));
    expect(screen.getByRole('checkbox', { name: /Dee/, checked: true })).toBeTruthy();
    expect(screen.getByText('Done · 2 chosen')).toBeTruthy();
    fireEvent.press(screen.getByRole('button', { name: /^Done/ }));
    expect(await screen.findByText('Text 2 people')).toBeTruthy();
    expect(screen.getByText('To Dee and Eli · 2')).toBeTruthy();
  });

  it('has no "Writing about" / Home bar on the people step', async () => {
    await openAnna();
    await startMoment('Announce the passing');
    await openPeople();
    expect(screen.queryByText(/Writing about/)).toBeNull();
    expect(screen.queryByLabelText('Back to home')).toBeNull();
  });

  it('has Close and no "What you\'ll need" on the people sheet, and Close lands on Ready to send', async () => {
    await openAnna();
    await startMoment('Announce the passing');
    await openPeople();
    expect(screen.queryByText("What you'll need")).toBeNull();
    fireEvent.press(screen.getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(screen.queryByRole('heading', { name: 'Who should get this?' })).toBeNull());
    expect(screen.getByRole('heading', { name: 'Announce the passing' })).toBeTruthy();
  });

  it.each([['Announce the passing'], ['Share the service'], ['Send thank-yous']])(
    '%s: the people sheet has a real header, focus goes to it, and Close lands on Ready to send',
    async (moment) => {
      const focus = jest.spyOn(AccessibilityInfo, 'setAccessibilityFocus').mockImplementation(() => undefined);
      await openAnna();
      await screen.findByText('Ready to send');
      focus.mockClear();
      await startMoment(moment);
      await screen.findByRole('button', { name: 'Choose who to tell' });
      focus.mockClear();
      expect(await openPeople()).toBeTruthy();
      // On a device the Modal's onShow sends screen-reader focus to the title itself.
      expect(focus).not.toHaveBeenCalled();
      act(() => screen.UNSAFE_getByType(Modal).props.onShow());
      const handle = focus.mock.calls.map(([h]) => h);
      expect(handle.length).toBeGreaterThan(0);
      expect([...mockHandles.entries()].find(([, h]) => h === handle[0])?.[0]).toBeTruthy();
      focus.mockClear();
      fireEvent.press(screen.getByRole('button', { name: 'Close' }));
      await waitFor(() => expect(screen.queryByRole('heading', { name: 'Who should get this?' })).toBeNull());
      // iOS: focus goes back to the button that opened the sheet once the sheet reports it is gone.
      expect(focus).not.toHaveBeenCalled();
      act(() => screen.UNSAFE_getByType(Modal).props.onDismiss());
      expect(focus).toHaveBeenCalledTimes(1);
      expect(screen.getByRole('button', { name: 'Choose who to tell' })).toBeTruthy();
    },
  );

  it('Android Back closes the people sheet only; with it closed, Back returns to the person screen once', async () => {
    const handlers: (() => boolean)[] = [];
    jest.spyOn(BackHandler, 'addEventListener').mockImplementation((_e, h) => {
      handlers.push(h as () => boolean);
      return { remove: () => void handlers.splice(handlers.indexOf(h as () => boolean), 1) };
    });
    await openAnna();
    await startMoment('Announce the passing');
    await openPeople();
    act(() => void [...handlers].reverse().some((h) => h()));
    await waitFor(() => expect(screen.queryByRole('heading', { name: 'Who should get this?' })).toBeNull());
    expect(screen.getByRole('heading', { name: 'Announce the passing' })).toBeTruthy();
    act(() => void [...handlers].reverse().some((h) => h()));
    expect(await screen.findByText('Ready to send')).toBeTruthy();
    await act(async () => new Promise((r) => setTimeout(r, 300)));
    expect(screen.getByText('Ready to send')).toBeTruthy();
    expect(screen.queryByText('Who should get this?')).toBeNull();
  });

  it('says who is open when the person arrives from Home', async () => {
    const say = jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => undefined);
    await AsyncStorage.setItem(SESSIONS_KEY, JSON.stringify([anna]));
    await AsyncStorage.setItem('gg.contacts.v1', JSON.stringify(contacts));
    render(<App />);
    fireEvent.press(await screen.findByLabelText('Anna'));
    await screen.findByText('Ready to send');
    await startMoment('Announce the passing');
    await openPeople();
    expect(say).toHaveBeenCalledWith('Now writing about Anna');
  });

  it('Close keeps the ticks and the sheet stays closed: it does not reopen, and Back still leaves for the hub', async () => {
    await openAnna();
    await startMoment('Announce the passing');
    await openPeople();
    fireEvent.press(await screen.findByText('Dee'));
    fireEvent.press(screen.getByRole('button', { name: 'Close' }));
    expect(await screen.findByText('To Dee · 1')).toBeTruthy();
    await act(async () => new Promise((r) => setTimeout(r, 300)));
    expect(screen.queryByRole('heading', { name: 'Who should get this?' })).toBeNull();
    fireEvent.press(screen.getByRole('button', { name: 'Back' }));
    expect(await screen.findByText('Ready to send')).toBeTruthy();
    // The moment can be started again from the person screen, and it still does not open the sheet.
    await startMoment('Announce the passing');
    expect(await screen.findByText('To Dee · 1')).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Who should get this?' })).toBeNull();
  });
});

describe('Ready to send (announcement)', () => {
  const toReview = async () => {
    await openAnna();
    await startMoment('Announce the passing');
    await openPeople();
    fireEvent.press(await screen.findByText('Dee'));
    fireEvent.press(screen.getByText(/^Done/));
    await screen.findByRole('heading', { name: 'Announce the passing' });
  };

  it('changes the message when the tone changes', async () => {
    await toReview();
    const plain = screen.getByText(/passed away/).props.children;
    fireEvent.press(screen.getByRole('button', { name: 'Edit wording' }));
    fireEvent.press(screen.getByRole('button', { name: 'Softer tone' }));
    expect(screen.getByRole('button', { name: 'Softer tone' }).props.accessibilityState.selected).toBe(true);
    fireEvent.press(screen.getByRole('button', { name: 'Done editing' }));
    expect(screen.queryByText(plain)).toBeNull();
  });

  it('keeps edited words: tone is unavailable until the suggested wording is back', async () => {
    await toReview();
    fireEvent.press(screen.getByRole('button', { name: 'Edit wording' }));
    fireEvent.changeText(screen.getByLabelText('Your message'), 'My own words.');
    fireEvent.press(screen.getByRole('button', { name: 'Softer tone' }));
    expect(screen.getByRole('button', { name: 'Softer tone' }).props.accessibilityState.disabled).toBe(true);
    expect(screen.getByLabelText('Your message').props.value).toBe('My own words.');
    expect(screen.getByText('Your own words are kept. Undo your edit to change the tone.')).toBeTruthy();
    fireEvent.press(screen.getByRole('button', { name: 'Use the suggested wording' }));
    expect(screen.getByLabelText('Your message').props.value).not.toBe('My own words.');
    fireEvent.press(screen.getByRole('button', { name: 'Softer tone' }));
    expect(screen.getByRole('button', { name: 'Softer tone' }).props.accessibilityState.selected).toBe(true);
  });

  it('sends the edited words to the sending step', async () => {
    jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
    await toReview();
    fireEvent.press(screen.getByRole('button', { name: 'Edit wording' }));
    fireEvent.changeText(screen.getByLabelText('Your message'), 'My own words.');
    fireEvent.press(screen.getByRole('button', { name: 'Text 1 person' }));
    fireEvent.press(await screen.findByText('Text Dee'));
    expect(decodeURIComponent(String(jest.mocked(Linking.openURL).mock.calls[0][0]))).toContain('body=Dee,\nMy own words.');
  });

  it('Back returns to the person screen', async () => {
    await toReview();
    fireEvent.press(screen.getByRole('button', { name: 'Back' }));
    expect(await screen.findByRole('heading', { name: 'Ready to send' })).toBeTruthy();
  });

  it('keeps the edited words and the people when Back leaves and the moment is started again', async () => {
    await toReview();
    fireEvent.press(screen.getByRole('button', { name: 'Edit wording' }));
    fireEvent.changeText(screen.getByLabelText('Your message'), 'My own words.');
    fireEvent.press(screen.getByRole('button', { name: 'Back' }));
    expect(await screen.findByRole('heading', { name: 'Ready to send' })).toBeTruthy();
    await startMoment('Announce the passing');
    expect(await screen.findByText('My own words.')).toBeTruthy();
    expect(screen.getByText('To Dee · 1')).toBeTruthy();
  });

  it('Change opens the people step with the ticks kept, and Continue returns to the message', async () => {
    await toReview();
    fireEvent.press(screen.getByRole('button', { name: 'Change who gets this' }));
    expect(await screen.findByText('Done · 1 chosen')).toBeTruthy();
    expect(screen.getByRole('checkbox', { name: /Dee/, checked: true })).toBeTruthy();
    fireEvent.press(screen.getByRole('checkbox', { name: /Eli/ }));
    fireEvent.press(screen.getByRole('button', { name: /^Done/ }));
    expect(await screen.findByText('To Dee and Eli · 2')).toBeTruthy();
    expect(screen.getByText('Text 2 people')).toBeTruthy();
  });

  it('keeps hand-edited wording when Change opens the people sheet and Close shuts it', async () => {
    await toReview();
    fireEvent.press(screen.getByRole('button', { name: 'Edit wording' }));
    fireEvent.changeText(screen.getByLabelText('Your message'), 'My own words.');
    fireEvent.press(screen.getByRole('button', { name: 'Change who gets this' }));
    await screen.findByRole('heading', { name: 'Who should get this?' });
    fireEvent.press(screen.getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(screen.queryByRole('heading', { name: 'Who should get this?' })).toBeNull());
    expect(screen.getByLabelText('Your message').props.value).toBe('My own words.');
  });

  it('sends on to the sending step', async () => {
    await toReview();
    fireEvent.press(screen.getByRole('button', { name: 'Text 1 person' }));
    expect(await screen.findByText('Text Dee')).toBeTruthy();
  });
});

describe('the end of a send', () => {
  const toSending = async (pick: string[], template = 'Announce the passing') => {
    jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
    await openAnna();
    await startMoment(template);
    await openPeople();
    for (const name of pick) {
      fireEvent.press(await screen.findByText(name));
    }
    fireEvent.press(screen.getByText(/^Done/));
    fireEvent.press(await screen.findByText(/^Text \d (person|people)$/));
  };

  it('returns to the hub with a calm note, announced, once the last person is done', async () => {
    const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibilityWithOptions').mockImplementation(() => undefined);
    await toSending(['Dee', 'Eli']);
    fireEvent.press(await screen.findByText('Text Dee'));
    await afterMessages();
    fireEvent.press(await screen.findByText('Next'));
    fireEvent.press(await screen.findByText('Text Eli'));
    await afterMessages();
    fireEvent.press(await screen.findByText('Done'));
    expect(await screen.findByText('Everyone has been told.')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Ready to send' })).toBeTruthy();
    // The announcement is done and the service still needs its date: the bottom button names the service.
    expect(within(screen.getByTestId('hub-action-bar')).getByText('Share the service')).toBeTruthy();
    expect(screen.queryByText("Who you're writing about")).toBeNull();
    expect(screen.getByText(/We don't keep a copy of what was sent/)).toBeTruthy();
    expect(announce).toHaveBeenCalledWith(
      "Everyone has been told. We don't keep a copy of what was sent — it's already where it belongs, in your own Messages app.",
      { queue: true },
    );
    expect(screen.getByLabelText(/Everyone has been told\. We don't keep a copy/)).toBeTruthy();
    // Lead in bold italic, rest in italic, and no border (#365).
    const lead = StyleSheet.flatten(screen.getByText('Everyone has been told.').props.style);
    const rest = StyleSheet.flatten(screen.getByText(/We don't keep a copy of what was sent/).props.style);
    expect(lead.fontFamily).toBe('SourceSerif4_600SemiBold_Italic');
    expect(rest.fontFamily).toBe('SourceSerif4_400Regular_Italic');
    expect(StyleSheet.flatten(screen.getByLabelText(/Everyone has been told\./).props.style)?.borderWidth ?? 0).toBe(0);
  });

  it('shows the shared sending screen: heading, who is next, and the hand-off note', async () => {
    jest.spyOn(AccessibilityInfo, 'announceForAccessibilityWithOptions').mockImplementation(() => undefined);
    await toSending(['Dee', 'Eli']);
    expect(await screen.findByRole('heading', { name: 'Dee' })).toBeTruthy();
    expect(screen.getByText('1 of 2')).toBeTruthy();
    fireEvent.press(screen.getByText('Text Dee'));
    expect(await screen.findByText('Send it in Messages, then come back and tap Next.')).toBeTruthy();
    await afterMessages();
    fireEvent.press(screen.getByText('Next'));
    expect(await screen.findByText('2 of 2')).toBeTruthy();
    expect(screen.getByText('Sent')).toBeTruthy();
  });

  it('says how many were told when someone was skipped', async () => {
    const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibilityWithOptions').mockImplementation(() => undefined);
    await toSending(['Dee', 'Eli']);
    fireEvent.press(await screen.findByText('Text Dee'));
    await afterMessages();
    fireEvent.press(await screen.findByText('Next'));
    fireEvent.press(await screen.findByText('Skip Eli'));
    expect(await screen.findByText('You told 1 of 2.')).toBeTruthy();
    expect(screen.getByText(/You can text the others from your own Messages app any time\./)).toBeTruthy();
    expect(announce).toHaveBeenCalledWith(
      "You told 1 of 2. You can text the others from your own Messages app any time. We don't keep a copy of what was sent — it's already where it belongs, in your own Messages app.",
      { queue: true },
    );
  });

  it('says no one was texted, with no privacy line, when everyone is skipped', async () => {
    const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibilityWithOptions').mockImplementation(() => undefined);
    await toSending(['Dee', 'Eli']);
    fireEvent.press(await screen.findByText('Skip Dee'));
    fireEvent.press(await screen.findByText('Skip Eli'));
    expect(await screen.findByText('No one was texted this time.')).toBeTruthy();
    expect(screen.getByLabelText(/^No one was texted this time\./).props.accessibilityLabel).not.toContain("We don't keep a copy");
    expect(screen.queryByText(/We don't keep a copy/)).toBeNull();
    expect(announce).toHaveBeenCalledWith('No one was texted this time. You can come back to this any time.', { queue: true });
  });

  it('stays on the hub with no timer, and the note goes when a step is started', async () => {
    jest.spyOn(AccessibilityInfo, 'announceForAccessibilityWithOptions').mockImplementation(() => undefined);
    await toSending(['Dee']);
    fireEvent.press(await screen.findByText('Text Dee'));
    await afterMessages();
    fireEvent.press(await screen.findByText('Done'));
    await screen.findByText('Everyone has been told.');
    await new Promise((r) => setTimeout(r, 300));
    expect(screen.getByText('Everyone has been told.')).toBeTruthy();
    // The announcement is now recorded as done; the service still needs its date, so it is a plain row.
    fireEvent.press(within(screen.getByTestId('hub-action-bar')).getByRole('button'));
    await waitFor(() => expect(screen.queryByText('Everyone has been told.')).toBeNull());
    // The service moment opened on its people (not the hub, not 'sent').
    expect(await openPeople()).toBeTruthy();
  });

  it('announces the note once, and focuses the hub heading as it opens', async () => {
    const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibilityWithOptions').mockImplementation(() => undefined);
    const focus = jest.spyOn(AccessibilityInfo, 'setAccessibilityFocus').mockImplementation(() => undefined);
    await toSending(['Dee']);
    fireEvent.press(await screen.findByText('Text Dee'));
    // Clear what earlier steps (or a slow earlier test) announced; only the hub's note is counted.
    announce.mockClear();
    focus.mockClear();
    await afterMessages();
    fireEvent.press(await screen.findByText('Done'));
    await screen.findByText('Everyone has been told.');
    const spoken = announce.mock.calls.filter(([text]) => String(text).startsWith('Everyone has been told.'));
    expect(spoken).toHaveLength(1);
    // The handle belongs to the hub's heading node, not some other node.
    const focusedNodes = focus.mock.calls.map(([handle]) => [...mockHandles.entries()].find(([, h]) => h === handle)?.[0]);
    expect(focusedNodes.some((node) => (node as { props?: { children?: unknown } } | undefined)?.props?.children === 'Ready to send')).toBe(true);
    expect(screen.getByLabelText(/Everyone has been told\./).props.accessibilityLiveRegion).toBe('polite');
  });

  it('the hub has no Home button: the note stays and the name is the way to other people', async () => {
    jest.spyOn(AccessibilityInfo, 'announceForAccessibilityWithOptions').mockImplementation(() => undefined);
    await toSending(['Dee']);
    fireEvent.press(await screen.findByText('Text Dee'));
    await afterMessages();
    fireEvent.press(await screen.findByText('Done'));
    await screen.findByText('Everyone has been told.');
    expect(screen.queryByRole('button', { name: 'Back' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Home' })).toBeNull();
    expect(screen.queryByText("Who you're writing about")).toBeNull();
    expect(screen.getByText('Everyone has been told.')).toBeTruthy();
  });

  it('finishing the obituary lands on the hub with the note', async () => {
    jest.spyOn(AccessibilityInfo, 'announceForAccessibilityWithOptions').mockImplementation(() => undefined);
    jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
    await openAnna();
    await startMoment('Share the obituary');
    fireEvent.changeText(await screen.findByLabelText('Link to the obituary'), 'https://legacy.com/anna');
    fireEvent.press(screen.getByRole('button', { name: 'Choose who to send it to' }));
    await openPeople();
    fireEvent.press(await screen.findByText('Dee'));
    fireEvent.press(screen.getByText(/^Done/));
    await screen.findByRole('heading', { name: 'Share the obituary' });
    fireEvent.press(screen.getByText('Text 1 person'));
    fireEvent.press(await screen.findByText('Text Dee'));
    await afterMessages();
    fireEvent.press(await screen.findByText('Done'));
    expect(await screen.findByRole('heading', { name: 'Ready to send' })).toBeTruthy();
    expect(screen.getByText(/We don't keep a copy of what was sent/)).toBeTruthy();
  });
});

// Edit person lives in the name switcher. On iOS the choice runs when the sheet has finished closing (onDismiss).
function editPersonFromSwitcher() {
  fireEvent.press(screen.getByRole('button', { name: /^Writing about / }));
  fireEvent.press(screen.getByRole('button', { name: 'Edit person' }));
  act(() => screen.UNSAFE_getAllByType(Modal).find((m) => m.props.testID === 'switcher-sheet')?.props.onDismiss());
}

describe('Edit person from the hub', () => {
  it('Back from setup returns to the hub, not Home', async () => {
    await openAnna();
    await screen.findByText('Ready to send');
    editPersonFromSwitcher();
    // Back returns to the hub, so it is named plain "Back", not "Back to home".
    expect(screen.queryByLabelText('Back to home')).toBeNull();
    fireEvent.press(await screen.findByRole('button', { name: 'Back' }));
    expect(await screen.findByRole('heading', { name: 'Ready to send' })).toBeTruthy();
    expect(screen.queryByText("Who you're writing about")).toBeNull();
  });

  it('drops the sent note: finish a send, Edit person, Back shows the hub without it', async () => {
    jest.spyOn(AccessibilityInfo, 'announceForAccessibilityWithOptions').mockImplementation(() => undefined);
    jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
    await openAnna();
    await startMoment('Announce the passing');
    await openPeople();
    fireEvent.press(await screen.findByText('Dee'));
    fireEvent.press(screen.getByText(/^Done/));
    fireEvent.press(await screen.findByText(/^Text \d (person|people)$/));
    fireEvent.press(await screen.findByText('Text Dee'));
    await afterMessages();
    fireEvent.press(await screen.findByText('Done'));
    await screen.findByText('Everyone has been told.');
    editPersonFromSwitcher();
    fireEvent.press(await screen.findByRole('button', { name: 'Back' }));
    expect(await screen.findByRole('heading', { name: 'Ready to send' })).toBeTruthy();
    expect(screen.queryByText('Everyone has been told.')).toBeNull();
  });
});

describe('stepping past the announcement intro (#671)', () => {
  it('steps once per arrival on announce, even when nextStep changes while it stays there', () => {
    const first = jest.fn();
    const second = jest.fn();
    const { rerender } = renderHook(({ on, next }: { on: boolean; next: () => void }) => useSkipAnnounce(on, next), {
      initialProps: { on: true, next: first },
    });
    rerender({ on: true, next: second });
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).not.toHaveBeenCalled();
    // Leaving and arriving again steps again.
    rerender({ on: false, next: second });
    rerender({ on: true, next: second });
    expect(second).toHaveBeenCalledTimes(1);
  });
});
