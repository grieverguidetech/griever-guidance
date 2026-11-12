import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render, screen } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Session } from '@griever/hooks';
import { App } from './App';
import { SESSIONS_KEY } from '../lib/useDeviceSessions';

// #691: on arrival on Ready to send the people sheet must never be visible, not even for one render.
// On iOS a Modal shown and hidden back to back leaves an invisible window that takes every touch.
// Every `visible` value the sheet is rendered with is recorded here (jest hoists the `mock` prefix).
const mockVisibleSeen: boolean[] = [];
jest.mock('../ui/Sheet', () => {
  const actual = jest.requireActual('../ui/Sheet') as typeof import('../ui/Sheet');
  const React = require('react') as typeof import('react');
  return {
    ...actual,
    Sheet: (props: { visible?: boolean }) => {
      mockVisibleSeen.push(props.visible ?? true);
      return React.createElement(actual.Sheet, props as never);
    },
  };
});

const session = {
  id: 'a', flowId: 'flow-a', ownerId: null, role: 'owner', personName: 'Anna', dateOfPassing: '', senderName: 'Peter', obituaryUrl: '', announcementMessage: 'Anna passed away peacefully.', serviceMessage: 'Come as you are.', thanksMessage: 'Thank you for being there.',
  createdAt: '2026-10-01T00:00:00.000Z', lastOpenedAt: '2026-10-01T00:00:00.000Z',
  drafts: {}, serviceReady: false, recipientsNotified: {}, momentCompletedAt: {}, remindersScheduled: [],
} as unknown as Session;

describe('the people sheet on arrival (#691)', () => {
  beforeEach(async () => {
    mockVisibleSeen.length = 0;
    await AsyncStorage.clear();
    await AsyncStorage.setItem(SESSIONS_KEY, JSON.stringify([session]));
  });

  it('is never visible when the announcement arrives on Ready to send', async () => {
    render(<App />);
    fireEvent.press(await screen.findByLabelText('Anna', {}, { timeout: 10000 }));
    fireEvent.press((await screen.findAllByRole('button', { name: /Announce the passing/ }))[0]);
    expect(await screen.findByRole('button', { name: /^Choose who to tell/ })).toBeTruthy();
    expect(mockVisibleSeen.length).toBeGreaterThan(0);
    expect(mockVisibleSeen).not.toContain(true);
  });

  it('is visible once the user asks for it', async () => {
    render(<App />);
    fireEvent.press(await screen.findByLabelText('Anna', {}, { timeout: 10000 }));
    fireEvent.press((await screen.findAllByRole('button', { name: /Announce the passing/ }))[0]);
    fireEvent.press(await screen.findByRole('button', { name: /^Choose who to tell/ }));
    expect(mockVisibleSeen).toContain(true);
  });
});
