import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { AccessibilityInfo, Modal, Platform, StyleSheet } from 'react-native';
import { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { CHECKLIST_PHASES } from '@griever/shared';
import { act, fireEvent, render, screen, within } from '@testing-library/react-native';
// Jest has no native view tree, so findNodeHandle returns null; the focus test needs a handle.
// This path is specific to react-native 0.81 (Expo SDK 54). Re-check it when react-native is upgraded.
jest.mock('react-native/Libraries/ReactNative/RendererProxy', () => ({
  ...jest.requireActual<object>('react-native/Libraries/ReactNative/RendererProxy'),
  // A distinct handle per node, so a test can tell which node got screen-reader focus. The first node asked (the header) gets 1.
  findNodeHandle: (node: unknown) => {
    const g = globalThis as unknown as { nodeHandles?: Map<unknown, number> };
    g.nodeHandles ??= new Map();
    if (!g.nodeHandles.has(node)) {
      g.nodeHandles.set(node, g.nodeHandles.size + 1);
    }
    return g.nodeHandles.get(node);
  },
}));

import { SetupScreen } from './SetupScreen';

const setup = (initial = { personName: '', dateOfPassing: '' }) => {
  const onContinue = jest.fn();
  const onBack = jest.fn();
  const onSetItem = jest.fn();
  render(<SetupScreen initial={initial} checklist={undefined} onSetItem={onSetItem} onContinue={onContinue} onBack={onBack} />);
  return { onContinue, onBack, onSetItem };
};

const todayText = () => {
  const today = new Date();
  return `${today.toLocaleString('en-US', { month: 'long' })} ${today.getDate()}, ${today.getFullYear()}`;
};
const dateButton = () => screen.getByRole('button', { name: 'Date they passed (optional)' });
/** What the OS does when a day is chosen in the picker. */
const choose = (date: Date) => fireEvent(screen.getByTestId('date-picker'), 'change', { type: 'set' }, date);

describe('SetupScreen', () => {
  beforeEach(() => {
    (globalThis as unknown as { nodeHandles?: Map<unknown, number> }).nodeHandles?.clear();
  });


  it('has a header, labelled controls and no obituary field (C10)', () => {
    setup();
    expect(screen.getByRole('heading', { name: 'Who are we writing about?' })).toBeTruthy();
    expect(screen.getByLabelText('Their name, required')).toBeTruthy();
    expect(dateButton()).toBeTruthy();
    expect(screen.queryByLabelText(/obituary/i)).toBeNull();
    expect(screen.queryByText(/obituary/i)).toBeNull();
  });

  it('keeps Continue unavailable until a name is typed, and says why', () => {
    const { onContinue } = setup();
    const button = screen.getByRole('button', { name: 'Continue' });
    expect(button.props.accessibilityState.disabled).toBe(true);
    expect(button.props.accessibilityHint).toBe('Type their name to continue.');
    fireEvent.press(button);
    expect(onContinue).not.toHaveBeenCalled();
    fireEvent.changeText(screen.getByLabelText('Their name, required'), '   ');
    expect(screen.getByRole('button', { name: 'Continue' }).props.accessibilityState.disabled).toBe(true);
    fireEvent.changeText(screen.getByLabelText('Their name, required'), 'Anna');
    expect(screen.getByRole('button', { name: 'Continue' }).props.accessibilityHint).toBeUndefined();
  });

  it('continues with a name alone; the date is optional', () => {
    const { onContinue } = setup();
    fireEvent.changeText(screen.getByLabelText('Their name, required'), 'Anna Lee');
    fireEvent.press(screen.getByRole('button', { name: 'Continue' }));
    expect(onContinue).toHaveBeenCalledWith({ personName: 'Anna Lee', dateOfPassing: '' });
  });

  it('shows no picker until the date control is pressed, then a chosen day is shown and kept', () => {
    const { onContinue } = setup();
    expect(screen.queryByTestId('date-picker')).toBeNull();
    expect(screen.getByText('Choose a date')).toBeTruthy();
    fireEvent.press(dateButton());
    expect(screen.getByTestId('date-picker').props.mode).toBe('date');
    choose(new Date(2025, 5, 7));
    expect(screen.getByText('June 7, 2025')).toBeTruthy();
    expect(dateButton().props.accessibilityValue).toEqual({ text: 'June 7, 2025' });
    fireEvent.changeText(screen.getByLabelText('Their name, required'), ' Anna Lee ');
    fireEvent.press(screen.getByRole('button', { name: 'Continue' }));
    expect(onContinue).toHaveBeenCalledWith({ personName: 'Anna Lee', dateOfPassing: 'June 7, 2025' });
  });

  it('allows no day after today, and opens on the saved date', () => {
    setup({ personName: 'Anna', dateOfPassing: 'May 2, 2026' });
    fireEvent.press(dateButton());
    const picker = screen.getByTestId('date-picker');
    const max = picker.props.maximumDate as Date;
    expect(Math.abs(max.getTime() - Date.now())).toBeLessThan(60_000);
    const value = picker.props.value as Date;
    expect([value.getFullYear(), value.getMonth(), value.getDate()]).toEqual([2026, 4, 2]);
  });

  it('can close the picker with Done and clear the date', () => {
    const { onContinue } = setup({ personName: 'Anna', dateOfPassing: 'May 2, 2026' });
    expect(screen.getByText('May 2, 2026')).toBeTruthy();
    fireEvent.press(dateButton());
    fireEvent.press(screen.getByRole('button', { name: 'Clear the date' }));
    expect(screen.getByText('Choose a date')).toBeTruthy();
    expect(screen.queryByTestId('date-picker')).toBeNull();
    fireEvent.press(dateButton());
    fireEvent.press(screen.getByRole('button', { name: 'Done' }));
    expect(screen.queryByTestId('date-picker')).toBeNull();
    fireEvent.press(screen.getByRole('button', { name: 'Continue' }));
    expect(onContinue).toHaveBeenCalledWith({ personName: 'Anna', dateOfPassing: todayText() });
  });

  it('Done saves the day the calendar shows, even if nothing was touched', () => {
    const { onContinue } = setup({ personName: 'Anna', dateOfPassing: '' });
    fireEvent.press(dateButton());
    fireEvent.press(screen.getByRole('button', { name: 'Done' }));
    const expected = todayText();
    expect(screen.getByText(expected)).toBeTruthy();
    fireEvent.press(screen.getByRole('button', { name: 'Continue' }));
    expect(onContinue).toHaveBeenCalledWith({ personName: 'Anna', dateOfPassing: expected });
  });

  it('keeps the calendar on the day chosen, and offers no day before 2000', () => {
    setup();
    fireEvent.press(dateButton());
    choose(new Date(2025, 5, 7));
    const picker = screen.getByTestId('date-picker');
    expect((picker.props.value as Date).getDate()).toBe(7);
    expect((picker.props.minimumDate as Date).getFullYear()).toBe(2000);
  });

  it('describes the date control and returns screen-reader focus to it after Done and Clear', () => {
    const focus = jest.spyOn(AccessibilityInfo, 'setAccessibilityFocus');
    setup({ personName: 'Anna', dateOfPassing: 'May 2, 2026' });
    expect(dateButton().props.accessibilityHint).toBe('Opens a calendar');
    focus.mockClear();
    fireEvent.press(dateButton());
    fireEvent.press(screen.getByRole('button', { name: 'Done' }));
    expect(focus).toHaveBeenCalledTimes(1);
    fireEvent.press(dateButton());
    fireEvent.press(screen.getByRole('button', { name: 'Clear the date' }));
    expect(focus).toHaveBeenCalledTimes(2);
  });

  it('hides the visible labels from screen readers; the controls carry the names', () => {
    setup();
    expect(screen.getByText('Their name', { includeHiddenElements: true }).props.accessibilityElementsHidden).toBe(true);
    expect(screen.getByText('Their name', { includeHiddenElements: true }).props.importantForAccessibility).toBe('no-hide-descendants');
  });

  it('on Android opens the system dialog with no future dates', () => {
    const platform = jest.replaceProperty(Platform, 'OS', 'android');
    const { onContinue } = setup({ personName: 'Anna', dateOfPassing: '' });
    fireEvent.press(dateButton());
    const open = jest.mocked(DateTimePickerAndroid.open);
    expect(open).toHaveBeenCalledTimes(1);
    const options = open.mock.calls[0][0];
    expect(options.mode).toBe('date');
    expect(options.neutralButton).toEqual({ label: 'Clear the date' });
    expect((options.minimumDate as Date).getFullYear()).toBe(2000);
    expect(Math.abs((options.maximumDate as Date).getTime() - Date.now())).toBeLessThan(60_000);
    act(() => options.onChange?.({ type: 'set', nativeEvent: {} } as never, new Date(2024, 11, 31)));
    expect(screen.getByText('December 31, 2024')).toBeTruthy();
    // Cancelling the dialog changes nothing.
    act(() => open.mock.calls[0][0].onChange?.({ type: 'dismissed', nativeEvent: {} } as never, new Date(2020, 0, 1)));
    expect(screen.getByText('December 31, 2024')).toBeTruthy();
    // The neutral button clears the date.
    act(() => open.mock.calls[0][0].onChange?.({ type: 'neutralButtonPressed', nativeEvent: {} } as never, new Date(2020, 0, 1)));
    expect(screen.getByText('Choose a date')).toBeTruthy();
    act(() => options.onChange?.({ type: 'set', nativeEvent: {} } as never, new Date(2024, 11, 31)));
    fireEvent.press(screen.getByRole('button', { name: 'Continue' }));
    expect(onContinue).toHaveBeenCalledWith({ personName: 'Anna', dateOfPassing: 'December 31, 2024' });
    platform.restore();
  });

  it('shows a date saved as free text as it was, and keeps it unless changed', () => {
    const { onContinue } = setup({ personName: 'Anna', dateOfPassing: 'last spring' });
    expect(screen.getByText('last spring')).toBeTruthy();
    fireEvent.press(screen.getByRole('button', { name: 'Continue' }));
    expect(onContinue).toHaveBeenCalledWith({ personName: 'Anna', dateOfPassing: 'last spring' });
  });

  it('starts from what is already kept, and Back leaves without saving', () => {
    const { onBack, onContinue } = setup({ personName: 'Anna', dateOfPassing: 'May 2, 2026' });
    expect(screen.getByLabelText('Their name, required').props.value).toBe('Anna');
    fireEvent.press(screen.getByLabelText('Back to home'));
    expect(onBack).toHaveBeenCalledTimes(1);
    expect(onContinue).not.toHaveBeenCalled();
  });

  it('moves screen-reader focus to the header on arrival', () => {
    const focus = jest.spyOn(AccessibilityInfo, 'setAccessibilityFocus');
    setup();
    expect(focus).toHaveBeenCalledWith(1);
  });

  it('has a name placeholder and a 44pt outlined back button', () => {
    setup();
    expect(screen.getByPlaceholderText('e.g. Margaret Hayes')).toBeTruthy();
    expect(StyleSheet.flatten(screen.getByLabelText('Back to home').props.style)).toEqual(expect.objectContaining({ minHeight: 44, borderWidth: 1 }));
  });
});

// The node that got the last focus call is the host view of the What you'll need button: same press handler as the button on screen.
const focusedIsChecklistButton = (focus: jest.SpiedFunction<typeof AccessibilityInfo.setAccessibilityFocus>) => {
  const handle = focus.mock.calls.at(-1)?.[0];
  const handles = (globalThis as unknown as { nodeHandles: Map<any, number> }).nodeHandles;
  const node = [...handles].find(([, h]) => h === handle)?.[0];
  const button = screen.getByRole('button', { name: "What you'll need" });
  return node?.props?.role === 'button' && typeof node.props.onClick === 'function' && node.props.onClick === button.props.onClick;
};

describe('SetupScreen What you will need (#699)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (globalThis as unknown as { nodeHandles?: Map<unknown, number> }).nodeHandles?.clear();
  });

  const sheet = () => screen.UNSAFE_getAllByType(Modal).find((m) => m.props.testID === 'checklist-sheet') as NonNullable<ReturnType<typeof screen.UNSAFE_getByType>>;

  it('opens the same checklist sheet as the person screen, only after a tap', () => {
    setup();
    expect(sheet().props.visible).toBe(false);
    fireEvent.press(screen.getByRole('button', { name: "What you'll need" }));
    expect(sheet().props.visible).toBe(true);
    expect(within(screen.getByTestId('checklist-sheet')).getByText('Your ticks stay on this phone.')).toBeTruthy();
    expect(screen.queryByText('Not today. Just so none of it surprises you.')).toBeNull();
  });

  it('saves a tick through onSetItem with the item id', () => {
    const { onSetItem } = setup();
    fireEvent.press(screen.getByRole('button', { name: "What you'll need" }));
    fireEvent.press(within(screen.getByTestId('checklist-sheet')).getByRole('button', { name: /^Right away/ }));
    fireEvent.press(within(screen.getByTestId('checklist-sheet')).getAllByRole('checkbox')[0]);
    expect(onSetItem).toHaveBeenCalledTimes(1);
    expect(onSetItem.mock.calls[0][0]).toBe(CHECKLIST_PHASES.find((phase) => phase.key === 'right-away')?.itemIds[0]);
    expect(onSetItem.mock.calls[0][1]).toBe('done');
  });

  it('returns focus to the button on iOS through onDismiss', () => {
    const focus = jest.spyOn(AccessibilityInfo, 'setAccessibilityFocus').mockImplementation(() => undefined);
    const original = Platform.OS;
    Platform.OS = 'ios';
    try {
      setup();
      fireEvent.press(screen.getByRole('button', { name: "What you'll need" }));
      focus.mockClear();
      fireEvent.press(within(screen.getByTestId('checklist-sheet')).getByRole('button', { name: 'Close' }));
      expect(focus).not.toHaveBeenCalled();
      act(() => sheet().props.onDismiss());
      expect(focusedIsChecklistButton(focus)).toBe(true);
    } finally {
      Platform.OS = original;
      focus.mockRestore();
    }
  });

  it('returns focus to the button on Android when the sheet is closed', () => {
    jest.useFakeTimers();
    const focus = jest.spyOn(AccessibilityInfo, 'setAccessibilityFocus').mockImplementation(() => undefined);
    const original = Platform.OS;
    Platform.OS = 'android';
    try {
      setup();
      fireEvent.press(screen.getByRole('button', { name: "What you'll need" }));
      focus.mockClear();
      fireEvent.press(within(screen.getByTestId('checklist-sheet')).getByRole('button', { name: 'Close' }));
      act(() => {
        jest.runAllTimers();
      });
      expect(focusedIsChecklistButton(focus)).toBe(true);
    } finally {
      Platform.OS = original;
      focus.mockRestore();
      jest.useRealTimers();
    }
  });
});
