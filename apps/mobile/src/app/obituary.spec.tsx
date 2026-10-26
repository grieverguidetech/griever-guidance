import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { AccessibilityInfo, Platform } from 'react-native';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Session } from '@griever/hooks';
import { App } from './App';
import { SESSIONS_KEY } from '../lib/useDeviceSessions';

jest.mock('react-native/Libraries/ReactNative/RendererProxy', () => ({
  ...jest.requireActual<object>('react-native/Libraries/ReactNative/RendererProxy'),
  findNodeHandle: () => 1,
}));

const anna = {
  id: 'a', flowId: 'flow-a', ownerId: null, role: 'owner', personName: 'Anna', dateOfPassing: '', senderName: '', obituaryUrl: '',
  createdAt: '2026-10-01T00:00:00.000Z', lastOpenedAt: '2026-10-01T00:00:00.000Z',
  drafts: {}, serviceReady: false, recipientsNotified: {}, momentCompletedAt: {}, remindersScheduled: [],
} as unknown as Session;

const contacts = [{ contactId: 'c1', name: 'Dee', phone: '+15555550100', tier: 'family' }];

afterEach(() => {
  jest.restoreAllMocks();
});

const openObituary = async () => {
  await AsyncStorage.setItem(SESSIONS_KEY, JSON.stringify([anna]));
  await AsyncStorage.setItem('gg.contacts.v1', JSON.stringify(contacts));
  render(<App />);
  fireEvent.press(await screen.findByLabelText('Anna'));
  fireEvent.press(await screen.findByRole('button', { name: /Share the obituary/ }));
  await screen.findByRole('heading', { name: 'Has the obituary been published?' });
};

describe('sharing the obituary on mobile', () => {
  it('opens from the hub, with no "Not in the app yet" and no drafting card', async () => {
    await openObituary();
    expect(screen.queryByText(/Not in the app yet/)).toBeNull();
    expect(screen.queryByText('Not written yet?')).toBeNull();
  });

  it('a bad link blocks Continue with a reason, and Back returns to the hub', async () => {
    await openObituary();
    fireEvent.changeText(screen.getByLabelText('Link to the obituary'), 'has space');
    fireEvent.press(screen.getByRole('button', { name: 'Choose who to send it to' }));
    expect(await screen.findByText("That link doesn't look right. Copy it again from the paper or funeral home.")).toBeTruthy();
    expect(screen.queryByText('Who should know?')).toBeNull();
    fireEvent.press(screen.getByRole('button', { name: 'Back' }));
    expect(await screen.findByRole('button', { name: /Share the obituary/ })).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Has the obituary been published?' })).toBeNull();
  });

  it('gives the link field the error as its hint, and announces the error but not the starting reason (iOS)', async () => {
    jest.replaceProperty(Platform, 'OS', 'ios');
    const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => undefined);
    await openObituary();
    const reason = 'Paste the link to the obituary to continue.';
    const error = "That link doesn't look right. Copy it again from the paper or funeral home.";
    expect(announce).not.toHaveBeenCalledWith(reason);
    fireEvent.changeText(screen.getByLabelText('Link to the obituary'), 'has space');
    fireEvent.press(screen.getByRole('button', { name: 'Choose who to send it to' }));
    await screen.findByText(error);
    expect(announce).toHaveBeenCalledWith(error);
    expect(screen.getByLabelText('Link to the obituary').props.accessibilityHint).toBe(error);
  });

  it('shows exactly the message that will be sent, with https:// added to a bare link', async () => {
    await openObituary();
    fireEvent.changeText(screen.getByLabelText('Link to the obituary'), 'legacy.com/anna');
    const sent = 'We wanted to share the obituary for Anna:\n\nhttps://legacy.com/anna\n\nThank you for your love and support.';
    expect(screen.getByText(sent)).toBeTruthy();
    fireEvent.press(screen.getByRole('button', { name: 'Choose who to send it to' }));
    fireEvent.press(await screen.findByText('Dee'));
    fireEvent.press(screen.getByText('Continue'));
    await screen.findByRole('heading', { name: 'Review your message' });
    expect(screen.getByText(sent)).toBeTruthy();
  });

  it('takes the link through Who should know? to Review, with the link in the message', async () => {
    await openObituary();
    fireEvent.changeText(screen.getByLabelText('Link to the obituary'), 'https://legacy.com/anna');
    fireEvent.press(screen.getByRole('button', { name: 'Choose who to send it to' }));
    expect(await screen.findByText('Who should know?')).toBeTruthy();
    fireEvent.press(await screen.findByText('Dee'));
    fireEvent.press(screen.getByText('Continue'));
    await screen.findByRole('heading', { name: 'Review your message' });
    expect(screen.getByText(/https:\/\/legacy\.com\/anna/)).toBeTruthy();
    await waitFor(async () => {
      const saved = JSON.parse((await AsyncStorage.getItem(SESSIONS_KEY)) ?? '[]') as { obituaryUrl: string }[];
      expect(saved[0].obituaryUrl).toBe('https://legacy.com/anna');
    });
  });

  it('Back from Who should know? returns to the link screen with the link kept', async () => {
    await openObituary();
    fireEvent.changeText(screen.getByLabelText('Link to the obituary'), 'legacy.com/anna');
    fireEvent.press(screen.getByRole('button', { name: 'Choose who to send it to' }));
    await screen.findByText('Who should know?');
    fireEvent.press(screen.getByRole('button', { name: 'Back' }));
    expect((await screen.findByLabelText('Link to the obituary')).props.value).toBe('legacy.com/anna');
  });
});
