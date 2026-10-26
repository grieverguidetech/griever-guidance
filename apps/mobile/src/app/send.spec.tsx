import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { AccessibilityInfo, Linking, Modal } from 'react-native';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Session } from '@griever/hooks';
import { App, withoutServiceKnown } from './App';
import { SESSIONS_KEY } from '../lib/useDeviceSessions';

// Jest has no native view tree, so findNodeHandle returns null. A fake handle lets the test see focus sent.
// This path is specific to this react-native version. Re-check it when react-native is upgraded.
jest.mock('react-native/Libraries/ReactNative/RendererProxy', () => ({
  ...jest.requireActual<object>('react-native/Libraries/ReactNative/RendererProxy'),
  findNodeHandle: () => 1,
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

afterEach(() => {
  jest.restoreAllMocks();
});

const openAnna = async () => {
  await AsyncStorage.setItem(SESSIONS_KEY, JSON.stringify([anna]));
  await AsyncStorage.setItem('gg.contacts.v1', JSON.stringify(contacts));
  render(<App />);
  fireEvent.press(await screen.findByLabelText('Anna'));
};

// The hub comes first: Start is the announcement; the other steps are rows named for the step.
const startMoment = async (title: string) =>
  fireEvent.press(
    await screen.findByRole('button', { name: title === 'Announce the passing' ? 'Start' : new RegExp(title) }),
  );

describe('picking an announcement', () => {
  it('shows a real screen, not a blank one or the checklist', async () => {
    await openAnna();
    await startMoment('Announce the passing');
    expect(await screen.findByLabelText("Anything you'd like to add (optional)")).toBeTruthy();
    expect(screen.queryByText('Gather when you can')).toBeNull();
  });

  it('keeps the note typed on the announce screen, and Continue goes to Who should know?', async () => {
    await openAnna();
    await startMoment('Announce the passing');
    fireEvent.changeText(await screen.findByLabelText(/Anything you'd like to add/), 'She was peaceful.');
    fireEvent.press(screen.getByRole('button', { name: 'Continue' }));
    expect(await screen.findByText('Who should know?')).toBeTruthy();
    fireEvent.press(screen.getByRole('button', { name: 'Back' }));
    expect((await screen.findByLabelText(/Anything you'd like to add/)).props.value).toBe('She was peaceful.');
  });

  it('puts the typed note in the message on the confirm screen', async () => {
    await openAnna();
    await startMoment('Announce the passing');
    fireEvent.changeText(await screen.findByLabelText(/Anything you'd like to add/), 'She was peaceful.');
    fireEvent.press(screen.getByRole('button', { name: 'Continue' }));
    fireEvent.press(await screen.findByText('Dee'));
    fireEvent.press(screen.getByText('Continue'));
    expect(await screen.findByText(/She was peaceful\./)).toBeTruthy();
  });

  it('lets people be picked on Who should know?, and the picked people reach Review', async () => {
    await openAnna();
    await startMoment('Announce the passing');
    fireEvent.press(await screen.findByRole('button', { name: 'Continue' }));
    expect(await screen.findByText('0 selected')).toBeTruthy();
    fireEvent.press(await screen.findByRole('checkbox', { name: /Dee/ }));
    fireEvent.press(screen.getByRole('checkbox', { name: /Eli/ }));
    expect(screen.getByRole('checkbox', { name: /Dee/, checked: true })).toBeTruthy();
    expect(screen.getByText('2 selected')).toBeTruthy();
    fireEvent.press(screen.getByRole('button', { name: 'Continue' }));
    expect(await screen.findByText('Text 2 people')).toBeTruthy();
    expect(screen.getByText('This will go to 2 people as a text message.')).toBeTruthy();
  });

  it('Edit opens setup, and Back there returns to Announce with the note kept', async () => {
    await openAnna();
    await startMoment('Announce the passing');
    fireEvent.changeText(await screen.findByLabelText(/Anything you'd like to add/), 'She was peaceful.');
    fireEvent.press(screen.getByRole('button', { name: 'Edit' }));
    fireEvent.press(await screen.findByLabelText('Back to home'));
    expect((await screen.findByLabelText(/Anything you'd like to add/)).props.value).toBe('She was peaceful.');
  });

  it('moves screen-reader focus to the heading when Announce opens', async () => {
    const focus = jest.spyOn(AccessibilityInfo, 'setAccessibilityFocus').mockImplementation(() => undefined);
    await openAnna();
    await screen.findByText('One thing at a time.');
    focus.mockClear();
    await startMoment('Announce the passing');
    await screen.findByLabelText(/Anything you'd like to add/);
    expect(focus).toHaveBeenCalled();
  });

  it('has no "Writing about" / Home bar on Announce', async () => {
    await openAnna();
    await startMoment('Announce the passing');
    await screen.findByLabelText(/Anything you'd like to add/);
    expect(screen.queryByText(/Writing about/)).toBeNull();
    expect(screen.queryByLabelText('Back to home')).toBeNull();
  });

  it('opens What you will need in a sheet on Who should know?', async () => {
    await openAnna();
    await startMoment('Announce the passing');
    fireEvent.press(await screen.findByRole('button', { name: 'Continue' }));
    await screen.findByText('Who should know?');
    fireEvent.press(screen.getByRole('button', { name: "What you'll need" }));
    expect(screen.UNSAFE_getAllByType(Modal).some((m) => m.props.visible === true)).toBe(true);
  });

  it('opens What you will need in a sheet on Announce, and focus returns to the button when it closes', async () => {
    const focus = jest.spyOn(AccessibilityInfo, 'setAccessibilityFocus').mockImplementation(() => undefined);
    await openAnna();
    await startMoment('Announce the passing');
    await screen.findByLabelText(/Anything you'd like to add/);
    focus.mockClear();
    fireEvent.press(screen.getByRole('button', { name: "What you'll need" }));
    expect(screen.UNSAFE_getAllByType(Modal).some((m) => m.props.visible === true)).toBe(true);
    act(() => screen.UNSAFE_getAllByType(Modal).find((m) => m.props.onDismiss)?.props.onDismiss());
    expect(focus).toHaveBeenCalled();
  });

  it('steps over the service-known step in both directions', async () => {
    await openAnna();
    await startMoment('Announce the passing');
    fireEvent.press(await screen.findByText('Continue'));
    expect(await screen.findByText('Who should know?')).toBeTruthy();
    fireEvent.press(screen.getByRole('button', { name: 'Back' }));
    expect(await screen.findByLabelText("Anything you'd like to add (optional)")).toBeTruthy();
    fireEvent.press(screen.getByRole('button', { name: 'Back' }));
    // The first form's Back returns to the hub, not a picker.
    expect(await screen.findByText('One thing at a time.')).toBeTruthy();
    expect(screen.queryByText('Choose the type of message you would like to send.')).toBeNull();
  });
});

describe('Review your message (announcement)', () => {
  const toReview = async () => {
    await openAnna();
    await startMoment('Announce the passing');
    fireEvent.press(await screen.findByText('Continue'));
    fireEvent.press(await screen.findByText('Dee'));
    fireEvent.press(screen.getByText('Continue'));
    await screen.findByRole('heading', { name: 'Read it once before it goes' });
  };

  it('changes the message when the tone changes', async () => {
    await toReview();
    const plain = screen.getByText(/passed away/).props.children;
    fireEvent.press(screen.getByRole('button', { name: 'Softer tone' }));
    expect(screen.getByRole('button', { name: 'Softer tone' }).props.accessibilityState.selected).toBe(true);
    expect(screen.queryByText(plain)).toBeNull();
  });

  it('keeps edited words: tone is unavailable until the suggested wording is back', async () => {
    await toReview();
    fireEvent.press(screen.getByRole('button', { name: 'Edit wording' }));
    fireEvent.changeText(screen.getByLabelText('Your message'), 'My own words.');
    fireEvent.press(screen.getByRole('button', { name: 'Done editing' }));
    fireEvent.press(screen.getByRole('button', { name: 'Softer tone' }));
    expect(screen.getByRole('button', { name: 'Softer tone' }).props.accessibilityState.disabled).toBe(true);
    expect(screen.getByText('My own words.')).toBeTruthy();
    expect(screen.getByText('Your own words are kept. Undo your edit to change the tone.')).toBeTruthy();
    fireEvent.press(screen.getByRole('button', { name: 'Use the suggested wording' }));
    expect(screen.queryByText('My own words.')).toBeNull();
    fireEvent.press(screen.getByRole('button', { name: 'Softer tone' }));
    expect(screen.getByRole('button', { name: 'Softer tone' }).props.accessibilityState.selected).toBe(true);
  });

  it('sends the edited words to the sending step', async () => {
    jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
    await toReview();
    fireEvent.press(screen.getByRole('button', { name: 'Edit wording' }));
    fireEvent.changeText(screen.getByLabelText('Your message'), 'My own words.');
    fireEvent.press(screen.getByRole('button', { name: 'Text 1 person' }));
    fireEvent.press(await screen.findByText('Open Messages'));
    expect(decodeURIComponent(String(jest.mocked(Linking.openURL).mock.calls[0][0]))).toContain('body=My own words.');
  });

  it('opens What you will need in a sheet', async () => {
    await toReview();
    fireEvent.press(screen.getByRole('button', { name: "What you'll need" }));
    expect(screen.UNSAFE_getAllByType(Modal).some((m) => m.props.visible === true)).toBe(true);
  });

  it('sends on to the sending step', async () => {
    await toReview();
    fireEvent.press(screen.getByRole('button', { name: 'Text 1 person' }));
    expect(await screen.findByText('Open Messages')).toBeTruthy();
  });
});

describe('the end of a send', () => {
  const toSending = async (pick: string[], template = 'Announce the passing') => {
    jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
    await openAnna();
    await startMoment(template);
    if (template !== 'Share the obituary') {
      fireEvent.press(await screen.findByText('Continue'));
    }
    for (const name of pick) {
      fireEvent.press(await screen.findByText(name));
    }
    fireEvent.press(screen.getByText('Continue'));
    fireEvent.press(await screen.findByText(/^Text \d (person|people)$/));
  };

  it('returns Home with a calm note, announced, once the last person is done', async () => {
    const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibilityWithOptions').mockImplementation(() => undefined);
    await toSending(['Dee', 'Eli']);
    fireEvent.press(await screen.findByText('Open Messages'));
    fireEvent.press(await screen.findByText('Next'));
    fireEvent.press(await screen.findByText('Open Messages'));
    fireEvent.press(await screen.findByText('Done'));
    expect(await screen.findByText('Everyone has been told.')).toBeTruthy();
    expect(screen.getByText("Who you're writing about")).toBeTruthy();
    expect(screen.getByText(/We don't keep a copy of what was sent/)).toBeTruthy();
    expect(announce).toHaveBeenCalledWith('Everyone has been told.', { queue: true });
    expect(screen.getByLabelText(/Everyone has been told\. We don't keep a copy/)).toBeTruthy();
  });

  it('says how many were told when someone was skipped', async () => {
    const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibilityWithOptions').mockImplementation(() => undefined);
    await toSending(['Dee', 'Eli']);
    fireEvent.press(await screen.findByText('Open Messages'));
    fireEvent.press(await screen.findByText('Next'));
    fireEvent.press(await screen.findByText('Skip'));
    const line = 'You told 1 of 2. You can text the others from your own Messages app any time.';
    expect(await screen.findByText(line)).toBeTruthy();
    expect(announce).toHaveBeenCalledWith(line, { queue: true });
  });

  it('stays on Home with no timer, and the note goes when a person is opened', async () => {
    jest.spyOn(AccessibilityInfo, 'announceForAccessibilityWithOptions').mockImplementation(() => undefined);
    await toSending(['Dee']);
    fireEvent.press(await screen.findByText('Open Messages'));
    fireEvent.press(await screen.findByText('Done'));
    await screen.findByText('Everyone has been told.');
    await new Promise((r) => setTimeout(r, 300));
    expect(screen.getByText('Everyone has been told.')).toBeTruthy();
    fireEvent.press(screen.getByLabelText('Anna'));
    await waitFor(() => expect(screen.queryByText('Everyone has been told.')).toBeNull());
  });
});

describe('stepping over serviceKnown', () => {
  const fake = (step: string, steps: string[]) => {
    const nextStep = jest.fn();
    const prevStep = jest.fn();
    const flow = { step, steps, nextStep, prevStep } as unknown as Parameters<typeof withoutServiceKnown>[0];
    return { wrapped: withoutServiceKnown(flow), nextStep, prevStep };
  };

  it('steps twice from announce while serviceKnown is in the path', () => {
    const { wrapped, nextStep } = fake('announce', ['template', 'announce', 'serviceKnown', 'contacts']);
    wrapped.nextStep();
    expect(nextStep).toHaveBeenCalledTimes(2);
  });

  it('steps once from announce when the path has no serviceKnown, so contacts is not skipped', () => {
    const { wrapped, nextStep } = fake('announce', ['template', 'announce', 'contacts', 'review']);
    wrapped.nextStep();
    expect(nextStep).toHaveBeenCalledTimes(1);
  });

  it('steps back twice from contacts only when serviceKnown is in the path', () => {
    const withIt = fake('contacts', ['template', 'announce', 'serviceKnown', 'contacts']);
    withIt.wrapped.prevStep();
    expect(withIt.prevStep).toHaveBeenCalledTimes(2);
    const without = fake('contacts', ['template', 'announce', 'contacts']);
    without.wrapped.prevStep();
    expect(without.prevStep).toHaveBeenCalledTimes(1);
  });
});
