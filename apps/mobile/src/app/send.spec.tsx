import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { AccessibilityInfo, Linking } from 'react-native';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Session } from '@griever/hooks';
import { App, withoutServiceKnown } from './App';
import { SESSIONS_KEY } from '../lib/useDeviceSessions';

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

  it('keeps the note typed on the announce screen, and Continue goes to Select recipients', async () => {
    await openAnna();
    await startMoment('Announce the passing');
    fireEvent.changeText(await screen.findByLabelText(/Anything you'd like to add/), 'She was peaceful.');
    fireEvent.press(screen.getByRole('button', { name: 'Continue' }));
    expect(await screen.findByText('Select recipients')).toBeTruthy();
    fireEvent.press(screen.getByText('← Back'));
    expect((await screen.findByLabelText(/Anything you'd like to add/)).props.value).toBe('She was peaceful.');
  });

  it('steps over the service-known step in both directions', async () => {
    await openAnna();
    await startMoment('Announce the passing');
    fireEvent.press(await screen.findByText('Continue'));
    expect(await screen.findByText('Select recipients')).toBeTruthy();
    fireEvent.press(screen.getByText('← Back'));
    expect(await screen.findByLabelText("Anything you'd like to add (optional)")).toBeTruthy();
    fireEvent.press(screen.getByRole('button', { name: 'Back' }));
    // The first form's Back returns to the hub, not a picker.
    expect(await screen.findByText('One thing at a time.')).toBeTruthy();
    expect(screen.queryByText('Choose the type of message you would like to send.')).toBeNull();
  });
});

describe('the end of a send', () => {
  const toSending = async (pick: string[], template = 'Announce the passing') => {
    jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
    await openAnna();
    await startMoment(template);
    if (template !== 'Share the obituary') fireEvent.press(await screen.findByText('Continue'));
    for (const name of pick) fireEvent.press(await screen.findByText(name));
    fireEvent.press(screen.getByText('Continue'));
    fireEvent.press(await screen.findByText('Text these people'));
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
