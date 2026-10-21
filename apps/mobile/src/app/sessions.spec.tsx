import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { App } from './App';
import { createSessionCache, SESSIONS_KEY, ACTIVE_KEY } from '../lib/useDeviceSessions';
import { freshDraft } from '@griever/hooks';
import { HYDRATE_TIMEOUT_MS } from '../lib/deviceCache';

const NAME_PLACEHOLDER = 'e.g. Margaret Ellen Hayes';

const START = "Start with someone I've lost";
const ANOTHER = "Someone else I've lost";
const SETUP_TITLE = 'Who are we writing about?';

// Create opens setup first (#213, behavior approved in #110). Type the name there and continue to the path.
async function startWith(name: string) {
  fireEvent.changeText(await screen.findByLabelText('Their name, required'), name);
  fireEvent.press(screen.getByRole('button', { name: 'Continue' }));
  await screen.findByText(`Writing about ${name}`);
}

// Home is where every launch lands; the first person is begun from there.
async function begin() {
  fireEvent.press(await screen.findByText(START));
  await screen.findByText(SETUP_TITLE);
}

async function addPerson() {
  fireEvent.press(await screen.findByLabelText('Back to home'));
  fireEvent.press(await screen.findByText(ANOTHER));
  await screen.findByText(SETUP_TITLE);
}

afterEach(() => {
  jest.restoreAllMocks();
});

describe('people kept on the phone', () => {
  it('keeps two people separate and switches between them', async () => {
    render(<App />);
    await begin();
    await startWith('Anna');
    await addPerson();
    expect((screen.getByLabelText('Their name, required')).props.value).toBe('');
    await startWith('Ben');

    fireEvent.press(screen.getByLabelText('Back to home'));
    expect(await screen.findByLabelText('Anna')).toBeTruthy();
    expect(screen.getByLabelText('Ben')).toBeTruthy();
    fireEvent.press(screen.getByLabelText('Anna'));
    expect(await screen.findByText('Writing about Anna')).toBeTruthy();

    // Each person is a separate record on the phone, holding only their own details.
    await waitFor(async () => {
      const saved = JSON.parse((await AsyncStorage.getItem(SESSIONS_KEY)) ?? '[]') as { personName: string }[];
      expect(saved.map((p) => p.personName).sort()).toEqual(['Anna', 'Ben']);
    });
  });

  it("starts the next person's form empty, even after the first was filled in", async () => {
    render(<App />);
    await begin();
    await startWith('Anna');
    await addPerson();
    expect(screen.getByLabelText('Their name, required').props.value).toBe('');
    await startWith('Ben');
    fireEvent.press(await screen.findByText('Thank-you note'));
    // Only the new person's own name is there; nothing carries over from Anna.
    expect((await screen.findByPlaceholderText(NAME_PLACEHOLDER)).props.value).toBe('Ben');
  });

  it('restores a half-finished draft, not just the names', async () => {
    const first = render(<App />);
    await begin();
    await startWith('Anna');
    fireEvent.press(screen.getByText('Thank-you note'));
    fireEvent.changeText(await screen.findByPlaceholderText(NAME_PLACEHOLDER), 'Anna Lee');
    await waitFor(async () => expect((await AsyncStorage.getItem(SESSIONS_KEY)) ?? '').toContain('Anna Lee'));
    first.unmount();

    render(<App />);
    fireEvent.press(await screen.findByLabelText('Anna Lee')); // typing the name renamed the person
    expect((await screen.findByPlaceholderText(NAME_PLACEHOLDER)).props.value).toBe('Anna Lee');
  });

  it('does not keep a finished send as a draft', async () => {
    const sent = { ...freshDraft({}), step: 'sent' as const, templateCategory: 'aftercare' as const, fields: { deceasedName: 'Anna' } };
    const person = { id: 's-1', personName: 'Anna', dateOfPassing: '', senderName: '', obituaryUrl: '', createdAt: 'x', lastOpenedAt: 'x', draft: sent, serviceReady: false, recipientsNotified: {}, momentCompletedAt: {}, remindersScheduled: [] };
    await AsyncStorage.setItem(SESSIONS_KEY, JSON.stringify([person]));
    await AsyncStorage.setItem(ACTIVE_KEY, 's-1');
    const first = render(<App />);
    await waitFor(async () => {
      const [saved] = JSON.parse((await AsyncStorage.getItem(SESSIONS_KEY)) ?? '[]');
      expect(saved.drafts.aftercare.step).toBe('sent');
      expect(saved.drafts.aftercare.fields).toEqual({});
      expect(saved.draft).toBeUndefined();
      expect(saved.personName).toBe('Anna');
    });
    first.unmount();
    render(<App />);
    fireEvent.press(await screen.findByLabelText('Anna'));
    expect(await screen.findByText('Writing about Anna')).toBeTruthy();
  });

  it("opens the person's latest moment and leaves their other moment's draft alone (#83)", async () => {
    const moment = (templateCategory: 'announcement' | 'aftercare', step: 'review' | 'details', fields: Record<string, string>) =>
      ({ ...freshDraft({}), templateCategory, step, fields });
    const announcement = moment('announcement', 'review', { personalNote: 'Kept as it was' });
    const person = {
      id: 's-1', personName: 'Anna', dateOfPassing: '', senderName: '', obituaryUrl: '', createdAt: 'x', lastOpenedAt: 'x',
      drafts: { announcement, aftercare: moment('aftercare', 'details', { deceasedName: 'Anna Lee' }) },
      draftsUpdatedAt: { announcement: '2026-10-01T00:00:00.000Z', aftercare: '2026-10-02T00:00:00.000Z' },
      serviceReady: false, recipientsNotified: {}, momentCompletedAt: {}, remindersScheduled: [],
    };
    await AsyncStorage.setItem(SESSIONS_KEY, JSON.stringify([person]));
    await AsyncStorage.setItem(ACTIVE_KEY, 's-1');
    render(<App />);
    fireEvent.press(await screen.findByLabelText('Anna'));
    fireEvent.changeText(await screen.findByPlaceholderText(NAME_PLACEHOLDER), 'Anna Marie');
    await waitFor(async () => {
      const [saved] = JSON.parse((await AsyncStorage.getItem(SESSIONS_KEY)) ?? '[]');
      expect(saved.drafts.aftercare.fields.deceasedName).toBe('Anna Marie');
      expect(saved.drafts.announcement).toEqual(announcement);
    });
  });

  it("reopens a moment left on the picker at that moment's first form (#99)", async () => {
    const onPicker = { ...freshDraft({}), templateCategory: 'aftercare' as const, step: 'template' as const, fields: { deceasedName: 'Anna Lee' } };
    const person = {
      id: 's-1', personName: 'Anna', dateOfPassing: '', senderName: '', obituaryUrl: '', createdAt: 'x', lastOpenedAt: 'x',
      drafts: { aftercare: onPicker }, draftsUpdatedAt: { aftercare: '2026-10-02T00:00:00.000Z' },
      serviceReady: false, recipientsNotified: {}, momentCompletedAt: {}, remindersScheduled: [],
    };
    await AsyncStorage.setItem(SESSIONS_KEY, JSON.stringify([person]));
    await AsyncStorage.setItem(ACTIVE_KEY, 's-1');
    render(<App />);
    fireEvent.press(await screen.findByLabelText('Anna'));
    expect((await screen.findByPlaceholderText(NAME_PLACEHOLDER)).props.value).toBe('Anna Lee');
  });

  it('reuses a blank person instead of adding another', async () => {
    render(<App />);
    await begin();
    fireEvent.press(await screen.findByLabelText('Back to home'));
    fireEvent.press(await screen.findByText(START)); // still nobody named, so still the first start
    expect(await screen.findByText(SETUP_TITLE)).toBeTruthy();
    await waitFor(async () => expect(JSON.parse((await AsyncStorage.getItem(SESSIONS_KEY)) ?? '[]')).toHaveLength(1));
  });

  it('restores both people and the open one after a relaunch', async () => {
    const first = render(<App />);
    await begin();
    await startWith('Anna');
    await addPerson();
    await startWith('Ben');
    await waitFor(async () => expect(JSON.parse((await AsyncStorage.getItem(SESSIONS_KEY)) ?? '[]')).toHaveLength(2));
    first.unmount();

    render(<App />); // a new App, a new in-memory cache, the same AsyncStorage
    expect(await screen.findByLabelText('Anna')).toBeTruthy();
    expect(screen.getByLabelText('Ben')).toBeTruthy();
  });

  it('makes no network calls', async () => {
    const fetchSpy = jest.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('offline'));
    render(<App />);
    await begin();
    await startWith('Anna');
    await addPerson();
    await startWith('Ben');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('offers no way to delete a person', async () => {
    render(<App />);
    await begin();
    await startWith('Anna');
    fireEvent.press(screen.getByLabelText('Back to home'));
    await screen.findByLabelText('Anna');
    expect(screen.queryByText(/delete|remove/i)).toBeNull();
    expect(screen.queryByLabelText(/delete|remove/i)).toBeNull();
  });
});

describe('when saved people cannot be read', () => {
  const saved = JSON.stringify([
    { id: 's-1', personName: 'Anna', dateOfPassing: '', senderName: '', obituaryUrl: '', createdAt: 'x', lastOpenedAt: 'x', draft: null, serviceReady: false, recipientsNotified: {}, momentCompletedAt: {}, remindersScheduled: [] },
    { id: 's-2', personName: 'Ben', dateOfPassing: '', senderName: '', obituaryUrl: '', createdAt: 'x', lastOpenedAt: 'x', draft: null, serviceReady: false, recipientsNotified: {}, momentCompletedAt: {}, remindersScheduled: [] },
  ]);

  it('never overwrites them after a failed read', async () => {
    await AsyncStorage.setItem(SESSIONS_KEY, saved);
    await AsyncStorage.setItem(ACTIVE_KEY, 's-2');
    const real = AsyncStorage.getItem.bind(AsyncStorage);
    jest.spyOn(AsyncStorage, 'getItem').mockImplementationOnce(async () => {
      throw new Error('read failed');
    });
    render(<App />);
    await begin(); // works in memory for this run
    await startWith('Cara');
    jest.restoreAllMocks();
    expect(await real(SESSIONS_KEY)).toBe(saved);
    expect(await real(ACTIVE_KEY)).toBe('s-2');
  });

  it('never overwrites corrupt data', async () => {
    await AsyncStorage.setItem(SESSIONS_KEY, '{not json');
    render(<App />);
    await begin();
    await startWith('Cara');
    expect(await AsyncStorage.getItem(SESSIONS_KEY)).toBe('{not json');
  });

  it('opens memory-only when storage does not answer in time', async () => {
    jest.useFakeTimers();
    await AsyncStorage.setItem(SESSIONS_KEY, saved);
    jest.spyOn(AsyncStorage, 'getItem').mockImplementation(() => new Promise<string | null>(() => undefined));
    const cache = createSessionCache();
    const hydrating = cache.hydrate();
    jest.advanceTimersByTime(HYDRATE_TIMEOUT_MS);
    await hydrating;
    cache.setItem(SESSIONS_KEY, '[]');
    jest.useRealTimers();
    jest.restoreAllMocks();
    expect(await AsyncStorage.getItem(SESSIONS_KEY)).toBe(saved);
  });
});

describe('session cache', () => {
  it('round-trips through AsyncStorage and ignores keys it was not given', async () => {
    await AsyncStorage.setItem(ACTIVE_KEY, 's-1');
    await AsyncStorage.setItem('other', 'x');
    const cache = createSessionCache();
    expect(cache.getItem(ACTIVE_KEY)).toBeNull();
    await cache.hydrate();
    expect(cache.getItem(ACTIVE_KEY)).toBe('s-1');
    expect(cache.getItem('other')).toBeNull();
    cache.setItem(SESSIONS_KEY, '[]');
    await waitFor(async () => expect(await AsyncStorage.getItem(SESSIONS_KEY)).toBe('[]'));
  });
});
