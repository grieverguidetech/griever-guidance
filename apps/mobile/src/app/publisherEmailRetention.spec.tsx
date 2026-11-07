import { describe, expect, it } from '@jest/globals';
import { render, screen, waitFor } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Session } from '@griever/hooks';
import { App } from './App';
import { publisherEmailKey } from '../lib/mailCompose';
import { SESSIONS_KEY } from '../lib/useDeviceSessions';

const person = (id: string, serviceDate: string) =>
  ({
    id, flowId: 'flow-' + id, ownerId: null, role: 'owner', personName: 'Anna ' + id, dateOfPassing: '', senderName: '', obituaryUrl: '', serviceDate,
    createdAt: '2026-01-01T00:00:00.000Z', lastOpenedAt: '2026-01-01T00:00:00.000Z',
    drafts: {}, serviceReady: false, recipientsNotified: {}, momentCompletedAt: {}, remindersScheduled: [],
  }) as unknown as Session;

describe('the saved publisher email is cleared with the contacts (MOB-9)', () => {
  it('is removed for everyone once the service is more than 30 days past', async () => {
    await AsyncStorage.setItem(SESSIONS_KEY, JSON.stringify([person('a', '2020-01-15'), person('b', '2020-02-01')]));
    await AsyncStorage.setItem('gg.contacts.v1', JSON.stringify([{ contactId: 'c1', name: 'Dee', phone: '+15555550100', tier: 'family' }]));
    await AsyncStorage.setItem(publisherEmailKey('a'), 'obits@paper.com');
    await AsyncStorage.setItem(publisherEmailKey('b'), 'desk@other.com');
    render(<App />);
    await waitFor(async () => expect(await AsyncStorage.getItem(publisherEmailKey('a'))).toBeNull(), { timeout: 10000 });
    expect(await AsyncStorage.getItem(publisherEmailKey('b'))).toBeNull();
  });

  it('is kept while the service is recent', async () => {
    const soon = new Date(Date.now() + 5 * 86400000).toISOString().slice(0, 10);
    await AsyncStorage.setItem(SESSIONS_KEY, JSON.stringify([person('a', soon)]));
    await AsyncStorage.setItem('gg.contacts.v1', JSON.stringify([{ contactId: 'c1', name: 'Dee', phone: '+15555550100', tier: 'family' }]));
    await AsyncStorage.setItem(publisherEmailKey('a'), 'obits@paper.com');
    render(<App />);
    await screen.findByLabelText('Anna a', {}, { timeout: 10000 });
    expect(await AsyncStorage.getItem(publisherEmailKey('a'))).toBe('obits@paper.com');
  });
});
