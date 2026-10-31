import { describe, expect, it, jest } from '@jest/globals';
import { AccessibilityInfo, StyleSheet } from 'react-native';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { AccountAuth } from '@griever/shared';
import { HomeScreen } from './HomeScreen';
import { AccountScreen } from './AccountScreen';
import { AccountStateProvider } from '../lib/AccountProvider';
import { CHECKLIST_KEY, SSN_TIP, WhatYoullNeedScreen } from './WhatYoullNeedScreen';

const mockGoBack = jest.fn();
jest.mock('@griever/api-client', () => ({
  ...jest.requireActual<object>('@griever/api-client'),
  getProfile: async () => ({ ok: true, profile: { id: 'u1', senderName: 'Sam', contactSource: null, fullName: null, birthDate: null, accountType: 'owner', createdAt: 'x', updatedAt: 'x' } }),
}));
jest.mock('@react-navigation/native', () => ({ useNavigation: () => ({ goBack: mockGoBack }) }));

// The row's detail line is part of its label, so match on the start of the name.
const row = (name: string) => screen.getByRole('checkbox', { name: new RegExp(`^${name}`) });

describe('What you\'ll need checklist', () => {
  it('starts with every row unticked', async () => {
    render(<WhatYoullNeedScreen />);
    expect(await screen.findAllByRole('checkbox')).toHaveLength(5);
    for (const box of screen.getAllByRole('checkbox')) expect(box.props.accessibilityState).toEqual({ checked: false });
  });

  it('ticks on a tap, strikes the text through, and saves on this device', async () => {
    render(<WhatYoullNeedScreen />);
    await screen.findAllByRole('checkbox');
    fireEvent.press(row('Life insurance policies'));
    expect(row('Life insurance policies').props.accessibilityState).toEqual({ checked: true });
    expect(StyleSheet.flatten(screen.getByText('Life insurance policies').props.style).textDecorationLine).toBe('line-through');
    await waitFor(async () => expect(await AsyncStorage.getItem(CHECKLIST_KEY)).toBe('["insurance"]'));
    fireEvent.press(row('Life insurance policies'));
    expect(row('Life insurance policies').props.accessibilityState).toEqual({ checked: false });
    await waitFor(async () => expect(await AsyncStorage.getItem(CHECKLIST_KEY)).toBe('[]'));
  });

  it('reads the detail line as part of the row label', async () => {
    render(<WhatYoullNeedScreen />);
    expect(await screen.findByRole('checkbox', { name: 'Any will or written wishes. Burial or cremation, and who they named' })).toBeTruthy();
  });

  it('counts two quick taps', async () => {
    render(<WhatYoullNeedScreen />);
    await screen.findAllByRole('checkbox');
    fireEvent.press(row('Life insurance policies'));
    fireEvent.press(row('Social Security number and ID'));
    await waitFor(async () => expect(await AsyncStorage.getItem(CHECKLIST_KEY)).toBe('["insurance","ssn"]'));
  });

  it('comes back ticked after a restart', async () => {
    await AsyncStorage.setItem(CHECKLIST_KEY, JSON.stringify(['will', 'military']));
    render(<WhatYoullNeedScreen />);
    await screen.findAllByRole('checkbox');
    await waitFor(() => expect(row('Any will or written wishes').props.accessibilityState).toEqual({ checked: true }));
    expect(row('Military discharge papers').props.accessibilityState).toEqual({ checked: true });
    expect(row('Life insurance policies').props.accessibilityState).toEqual({ checked: false });
  });
});

describe('Social Security tip', () => {
  const info = () => screen.getByRole('button', { name: 'Why we list this' });

  it('is hidden by default', async () => {
    render(<WhatYoullNeedScreen />);
    await screen.findAllByRole('checkbox');
    expect(screen.queryByText(SSN_TIP)).toBeNull();
    expect(info().props.accessibilityState).toEqual({ expanded: false });
  });

  it('opens on a press, closes on a second press, and flips expanded', async () => {
    render(<WhatYoullNeedScreen />);
    await screen.findAllByRole('checkbox');
    fireEvent.press(info());
    expect(screen.getByText(SSN_TIP).props.accessibilityLiveRegion).toBe('polite');
    expect(info().props.accessibilityState).toEqual({ expanded: true });
    fireEvent.press(info());
    expect(screen.queryByText(SSN_TIP)).toBeNull();
    expect(info().props.accessibilityState).toEqual({ expanded: false });
  });

  it('announces the tip on open, not on close', async () => {
    const spy = jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => undefined);
    spy.mockClear(); // the RN jest setup shares this mock across tests
    render(<WhatYoullNeedScreen />);
    await screen.findAllByRole('checkbox');
    fireEvent.press(info());
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith(SSN_TIP);
    fireEvent.press(info());
    expect(spy).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });

  it('closes on a touch outside the info button', async () => {
    render(<WhatYoullNeedScreen />);
    await screen.findAllByRole('checkbox');
    fireEvent.press(info());
    expect(screen.getByText(SSN_TIP)).toBeTruthy();
    fireEvent(screen.getByText("What you'll need"), 'touchStart');
    expect(screen.queryByText(SSN_TIP)).toBeNull();
  });

  it('closes when any row is ticked', async () => {
    render(<WhatYoullNeedScreen />);
    await screen.findAllByRole('checkbox');
    fireEvent.press(info());
    fireEvent.press(row('Life insurance policies'));
    expect(screen.queryByText(SSN_TIP)).toBeNull();
  });

  it('is at least 44 by 44, and the text has no exclamation point', async () => {
    render(<WhatYoullNeedScreen />);
    await screen.findAllByRole('checkbox');
    const style = StyleSheet.flatten(info().props.style as never) as Record<string, number>;
    expect(style.width).toBeGreaterThanOrEqual(44);
    expect(style.height).toBeGreaterThanOrEqual(44);
    expect(SSN_TIP).not.toContain('!');
  });
});

describe('top buttons', () => {
  const size = (el: { props: { style?: unknown } }) => {
    const style = StyleSheet.flatten(el.props.style as never) as Record<string, unknown>;
    return style;
  };

  it('Back is a labelled button, at least 44x44, with a visible outline', async () => {
    render(<WhatYoullNeedScreen />);
    await screen.findAllByRole('checkbox');
    const back = screen.getByRole('button', { name: 'Back' });
    const style = size(back);
    expect(style.minHeight).toBeGreaterThanOrEqual(44);
    expect(style.minWidth).toBeGreaterThanOrEqual(44);
    expect(style.borderWidth).toBeGreaterThan(0);
    expect(style.borderColor).toBeTruthy();
    fireEvent.press(back);
    expect(mockGoBack).toHaveBeenCalled();
  });

  it('the Home link (accounts off) is a labelled button, at least 44x44, with a visible outline', () => {
    const onWhatYoullNeed = jest.fn();
    render(<HomeScreen sessions={[]} canCreate onOpen={jest.fn()} onCreate={jest.fn()} onWhatYoullNeed={onWhatYoullNeed} />);
    const link = screen.getByRole('button', { name: "What you'll need" });
    const style = size(link);
    expect(style.minHeight).toBeGreaterThanOrEqual(44);
    expect(style.minWidth).toBeGreaterThanOrEqual(44);
    expect(style.borderWidth).toBeGreaterThan(0);
    expect(style.borderColor).toBeTruthy();
    fireEvent.press(link);
    expect(onWhatYoullNeed).toHaveBeenCalled();
  });
});

describe('old screens use the serif through SerifText', () => {
  it('a person row on Home is in the semibold serif (its 500 weight maps to semibold)', () => {
    const anna = { id: 'a', flowId: 'f', ownerId: null, role: 'owner', personName: 'Anna', dateOfPassing: '', senderName: '', obituaryUrl: '', createdAt: '2026-01-01', lastOpenedAt: '2026-01-01', drafts: {}, serviceReady: false, recipientsNotified: {}, momentCompletedAt: {}, remindersScheduled: [] };
    render(<HomeScreen sessions={[anna as never]} canCreate onOpen={jest.fn()} onCreate={jest.fn()} />);
    const style = StyleSheet.flatten(screen.getByText('Anna').props.style) as Record<string, unknown>;
    expect(style.fontFamily).toBe('SourceSerif4_600SemiBold');
    expect(style.fontWeight).toBeUndefined();
  });
});

describe('the list on Your account and the checklist screen share their ticks (#191)', () => {
  const auth: AccountAuth = { status: 'signed_in', userId: 'u1', getToken: async () => ({ ok: true, token: 't' }), signOut: async () => undefined };
  const accountScreen = (
    <AccountStateProvider auth={auth}>
      <AccountScreen onBack={() => undefined} />
    </AccountStateProvider>
  );

  it('shows a tick made on Your account in the checklist screen, and the reverse', async () => {
    await AsyncStorage.clear();
    const account = render(accountScreen);
    await screen.findAllByRole('checkbox');
    fireEvent.press(row('Life insurance policies'));
    await waitFor(async () => expect(await AsyncStorage.getItem(CHECKLIST_KEY)).toBe('["insurance"]'));
    account.unmount();

    const list = render(<WhatYoullNeedScreen />);
    await screen.findAllByRole('checkbox');
    expect(row('Life insurance policies').props.accessibilityState).toEqual({ checked: true });
    fireEvent.press(row('Military discharge papers'));
    await waitFor(async () => expect(await AsyncStorage.getItem(CHECKLIST_KEY)).toBe('["insurance","military"]'));
    list.unmount();

    render(accountScreen);
    await screen.findAllByRole('checkbox');
    expect(row('Military discharge papers').props.accessibilityState).toEqual({ checked: true });
  });
});
