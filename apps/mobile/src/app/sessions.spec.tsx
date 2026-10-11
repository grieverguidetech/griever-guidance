import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { App } from './App';
import { createSessionCache, SESSIONS_KEY, ACTIVE_KEY } from '../lib/useDeviceSessions';

const NAME_PLACEHOLDER = 'e.g. Margaret Ellen Hayes';

// Type a name into the first template's details form, then go back to the first screen.
async function startWith(name: string) {
  fireEvent.press(await screen.findByText('Thank-you note'));
  fireEvent.changeText(await screen.findByPlaceholderText(NAME_PLACEHOLDER), name);
  fireEvent.press(screen.getByText('← Back'));
  await screen.findByText(`Writing about ${name}`);
}

async function addPerson() {
  fireEvent.press(await screen.findByLabelText(/^Change who you are writing about/));
  fireEvent.press(await screen.findByText("Someone else I've lost"));
}

afterEach(() => {
  jest.restoreAllMocks();
});

describe('people kept on the phone', () => {
  it('keeps two people separate and switches between them', async () => {
    render(<App />);
    await startWith('Anna');
    await addPerson();
    expect(await screen.findByText('Writing about Someone new')).toBeTruthy();
    await startWith('Ben');

    fireEvent.press(screen.getByLabelText(/^Change who you are writing about/));
    expect(await screen.findByLabelText('Anna')).toBeTruthy();
    expect(screen.getByLabelText('Ben, current')).toBeTruthy();
    fireEvent.press(screen.getByLabelText('Anna'));
    expect(await screen.findByText('Writing about Anna')).toBeTruthy();

    // Each person is a separate record on the phone, holding only their own details.
    await waitFor(async () => {
      const saved = JSON.parse((await AsyncStorage.getItem(SESSIONS_KEY)) ?? '[]') as { personName: string }[];
      expect(saved.map((p) => p.personName).sort()).toEqual(['Anna', 'Ben']);
    });
  });

  it('restores both people and the open one after a relaunch', async () => {
    const first = render(<App />);
    await startWith('Anna');
    await addPerson();
    await startWith('Ben');
    await waitFor(async () => expect(JSON.parse((await AsyncStorage.getItem(SESSIONS_KEY)) ?? '[]')).toHaveLength(2));
    first.unmount();

    render(<App />); // a new App, a new in-memory cache, the same AsyncStorage
    expect(await screen.findByText('Writing about Ben')).toBeTruthy();
    fireEvent.press(screen.getByLabelText(/^Change who you are writing about/));
    expect(await screen.findByLabelText('Anna')).toBeTruthy();
    expect(screen.getByLabelText('Ben, current')).toBeTruthy();
  });

  it('makes no network calls', async () => {
    const fetchSpy = jest.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('offline'));
    render(<App />);
    await startWith('Anna');
    await addPerson();
    await startWith('Ben');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('offers no way to delete a person', async () => {
    render(<App />);
    await startWith('Anna');
    fireEvent.press(screen.getByLabelText(/^Change who you are writing about/));
    await screen.findByText('Who are you writing about?');
    expect(screen.queryByText(/delete|remove/i)).toBeNull();
    expect(screen.queryByLabelText(/delete|remove/i)).toBeNull();
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
