import { describe, expect, it, jest } from '@jest/globals';
import { StyleSheet } from 'react-native';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { HomeScreen } from './HomeScreen';
import { CHECKLIST_KEY, WhatYoullNeedScreen } from './WhatYoullNeedScreen';

const mockGoBack = jest.fn();
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

  it('says why the list asks for the Social Security number, in the same words as web', async () => {
    render(<WhatYoullNeedScreen />);
    // Same literal as the web spec (apps cannot import each other), so the two stay equal.
    const reason = 'The funeral home uses it to report the death. This app never asks for it.';
    expect(await screen.findByRole('checkbox', { name: `Social Security number and ID. ${reason}` })).toBeTruthy();
    expect(screen.getByText(reason)).toBeTruthy();
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

describe('top buttons', () => {
  const size = (el: { props: { style?: unknown } }) => {
    const style = StyleSheet.flatten(el.props.style as never) as Record<string, unknown>;
    return style;
  };

  it('Back is a labelled button, at least 44x44, with a visible border and fill', async () => {
    render(<WhatYoullNeedScreen />);
    await screen.findAllByRole('checkbox');
    const back = screen.getByRole('button', { name: 'Back' });
    const style = size(back);
    expect(style.minHeight).toBeGreaterThanOrEqual(44);
    expect(style.minWidth).toBeGreaterThanOrEqual(44);
    expect(style.borderWidth).toBeGreaterThan(0);
    expect(style.backgroundColor).toBeTruthy();
    fireEvent.press(back);
    expect(mockGoBack).toHaveBeenCalled();
  });

  it('the Home link is a labelled button, at least 44x44, with a visible border and fill', () => {
    const onWhatYoullNeed = jest.fn();
    render(<HomeScreen sessions={[]} canCreate onOpen={jest.fn()} onCreate={jest.fn()} onWhatYoullNeed={onWhatYoullNeed} />);
    const link = screen.getByRole('button', { name: "What you'll need" });
    const style = size(link);
    expect(style.minHeight).toBeGreaterThanOrEqual(44);
    expect(style.minWidth).toBeGreaterThanOrEqual(44);
    expect(style.borderWidth).toBeGreaterThan(0);
    expect(style.backgroundColor).toBeTruthy();
    fireEvent.press(link);
    expect(onWhatYoullNeed).toHaveBeenCalled();
  });
});
