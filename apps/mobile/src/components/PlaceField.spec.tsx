import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { useState } from 'react';
import { AccessibilityInfo, StyleSheet } from 'react-native';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { SERVICE_PLACE_TYPES } from '@griever/shared';
import type { PlaceSuggestion } from '@griever/shared';
import { PlaceField } from './PlaceField';
import type { PlaceFieldCopy, PlacesClient } from './PlaceField';

const copy: PlaceFieldCopy = {
  placesListLabel: 'Place suggestions',
  placesOne: '1 suggestion available',
  placesMany: '{count} suggestions available',
  placesNone: 'No matches',
  placesUnavailable: 'Suggestions are not available',
  placeFilled: 'Place filled in',
};

const chapel: PlaceSuggestion = { id: 'p1', text: 'Elm Chapel, 1 Elm St', mainText: 'Elm Chapel', secondaryText: '1 Elm St' };
const church: PlaceSuggestion = { id: 'p2', text: 'Elm Church, 9 Oak Ave', mainText: 'Elm Church', secondaryText: '9 Oak Ave' };

function fakeClient(overrides: Partial<PlacesClient> = {}) {
  const client: PlacesClient = {
    suggest: jest.fn<PlacesClient['suggest']>().mockResolvedValue([chapel, church]),
    details: jest.fn<PlacesClient['details']>().mockResolvedValue({ name: 'Elm Chapel', address: '1 Elm St, Town, ST 12345' }),
    newToken: jest.fn(() => 'token-0123456789abcdef'),
    ...overrides,
  };
  return client;
}

// Holds the value in state so typing and picking behave as they do in the row.
function Harness({ client, onChange }: { client: PlacesClient; onChange?: (v: string) => void }) {
  const [value, setValue] = useState('');
  return (
    <PlaceField
      copy={copy}
      value={value}
      onChange={(v) => {
        setValue(v);
        onChange?.(v);
      }}
      accessibleName="Location"
      placeholder="Place"
      client={client}
    />
  );
}

const input = () => screen.getByLabelText('Location');
const type = (text: string) => fireEvent.changeText(input(), text);
const settle = async (ms = 300) => {
  await act(async () => {
    await jest.advanceTimersByTimeAsync(ms);
  });
};

describe('PlaceField', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => undefined);
  });
  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('makes no call under 3 characters', async () => {
    const client = fakeClient();
    render(<Harness client={client} />);
    type('El');
    await settle(1000);
    expect(client.suggest).not.toHaveBeenCalled();
  });

  it('waits for a pause, then asks once with the latest text and the service types', async () => {
    const client = fakeClient();
    render(<Harness client={client} />);
    type('Elm');
    await settle(200);
    type('Elm C');
    await settle(200);
    expect(client.suggest).not.toHaveBeenCalled();
    await settle(100);
    expect(client.suggest).toHaveBeenCalledTimes(1);
    expect(client.suggest).toHaveBeenCalledWith('Elm C', SERVICE_PLACE_TYPES, 'token-0123456789abcdef');
  });

  it('lists at most 5 suggestions as buttons read as name, address, 44 high, with a polite count', async () => {
    const many = Array.from({ length: 7 }, (_, i) => ({ id: `p${i}`, text: `P${i}, A`, mainText: `P${i}`, secondaryText: 'A' }));
    const client = fakeClient({ suggest: jest.fn<PlacesClient['suggest']>().mockResolvedValue(many) });
    render(<Harness client={client} />);
    type('Elm');
    await settle();
    expect(screen.getAllByRole('button')).toHaveLength(5);
    const row = screen.getByRole('button', { name: 'P0, A' });
    expect(StyleSheet.flatten(row.props.style).minHeight).toBeGreaterThanOrEqual(44);
    expect(screen.getByText('5 suggestions available').props.accessibilityLiveRegion).toBe('polite');
    expect(screen.getByLabelText('Place suggestions')).toBeTruthy();
  });

  it('says so when nothing matches, and keeps typing open', async () => {
    const client = fakeClient({ suggest: jest.fn<PlacesClient['suggest']>().mockResolvedValue([]) });
    render(<Harness client={client} />);
    type('Elm');
    await settle();
    expect(screen.getByText('No matches')).toBeTruthy();
    expect(screen.queryAllByRole('button')).toHaveLength(0);
  });

  it('tapping a suggestion fills "{name}, {address}", closes the list and ends the token', async () => {
    const client = fakeClient();
    const onChange = jest.fn();
    render(<Harness client={client} onChange={onChange} />);
    type('Elm');
    await settle();
    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Elm Chapel, 1 Elm St' }));
    });
    expect(client.details).toHaveBeenCalledWith('p1', 'token-0123456789abcdef');
    expect(onChange).toHaveBeenLastCalledWith('Elm Chapel, 1 Elm St, Town, ST 12345');
    expect(input().props.value).toBe('Elm Chapel, 1 Elm St, Town, ST 12345');
    expect(screen.queryAllByRole('button')).toHaveLength(0);
    expect(screen.getByText('Place filled in')).toBeTruthy();
    // The next run of typing gets a fresh token.
    type('Oak');
    await settle();
    expect(client.newToken).toHaveBeenCalledTimes(2);
  });

  it('uses the suggestion text when details fail', async () => {
    const client = fakeClient({ details: jest.fn<PlacesClient['details']>().mockRejectedValue(new Error('x')) });
    render(<Harness client={client} />);
    type('Elm');
    await settle();
    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Elm Church, 9 Oak Ave' }));
    });
    expect(input().props.value).toBe('Elm Church, 9 Oak Ave');
  });

  it('on a failed search shows one calm line, keeps typing working and stops asking', async () => {
    const client = fakeClient({ suggest: jest.fn<PlacesClient['suggest']>().mockRejectedValue(new Error('503')) });
    const onChange = jest.fn();
    render(<Harness client={client} onChange={onChange} />);
    type('Elm');
    await settle();
    expect(screen.getByText('Suggestions are not available')).toBeTruthy();
    expect(screen.queryAllByRole('button')).toHaveLength(0);
    type('Elm Chapel on Main');
    await settle(1000);
    expect(onChange).toHaveBeenLastCalledWith('Elm Chapel on Main');
    expect(input().props.value).toBe('Elm Chapel on Main');
    expect(client.suggest).toHaveBeenCalledTimes(1);
  });

  it('drops an answer for text the user has already changed', async () => {
    let resolve: (value: PlaceSuggestion[]) => void = () => undefined;
    const client = fakeClient({
      suggest: jest.fn<PlacesClient['suggest']>().mockReturnValue(new Promise((r) => (resolve = r))),
    });
    render(<Harness client={client} />);
    type('Elm');
    await settle();
    type('El');
    await act(async () => {
      resolve([chapel]);
    });
    expect(screen.queryAllByRole('button')).toHaveLength(0);
  });
});
