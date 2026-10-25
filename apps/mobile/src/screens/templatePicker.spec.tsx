import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { AccessibilityInfo, Modal } from 'react-native';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { TemplatePickerScreen } from './TemplatePickerScreen';
import type { FlowProps } from '../app/App';

jest.mock('@react-navigation/native', () => ({ useNavigation: () => ({ navigate: jest.fn() }) }));
// Jest has no native view tree, so findNodeHandle returns null. A fake handle lets the test see focus sent.
// This path is specific to react-native 0.81 (Expo SDK 54). Re-check it when react-native is upgraded.
jest.mock('react-native/Libraries/ReactNative/RendererProxy', () => ({
  ...jest.requireActual<object>('react-native/Libraries/ReactNative/RendererProxy'),
  findNodeHandle: () => 1,
}));

const setup = (paymentsEnabled: boolean) => {
  const flow = { setTemplate: jest.fn(), nextStep: jest.fn() };
  render(<TemplatePickerScreen flow={flow as unknown as FlowProps['flow']} paymentsEnabled={paymentsEnabled} />);
  return flow;
};
const modal = () => screen.UNSAFE_getByType(Modal);
const lockedCards = () => screen.queryAllByRole('button').filter((b) => b.props.accessibilityHint === 'Included with the full plan');

describe('TemplatePickerScreen paywall demo (#292)', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('flag off: nothing is locked, no placeholder is mounted, and a card picks its template', () => {
    const flow = setup(false);
    expect(lockedCards()).toHaveLength(0);
    expect(screen.queryByText('Included with the full plan')).toBeNull();
    expect(screen.UNSAFE_queryByType(Modal)).toBeNull();
    fireEvent.press(screen.getByText('Share the service'));
    expect(flow.setTemplate).toHaveBeenCalledTimes(1);
    expect(flow.nextStep).toHaveBeenCalledTimes(1);
  });

  it('flag on: the announcement stays open; service and aftercare cards have role, label and hint, and are not marked disabled', () => {
    setup(true);
    const cards = lockedCards();
    expect(cards).toHaveLength(2);
    const labels = cards.map((c) => c.props.accessibilityLabel);
    expect(labels[0]).toMatch(/^Share the service\. /);
    expect(labels[1]).toMatch(/^Thank-you note\. /);
    for (const card of cards) {
      expect(card.props.accessibilityRole).toBe('button');
      expect(card.props.accessibilityState?.disabled).not.toBe(true);
    }
    expect(screen.getAllByText('Included with the full plan')).toHaveLength(2);
    expect(screen.getByText('Announce the passing')).toBeTruthy();
    expect(lockedCards().some((c) => String(c.props.accessibilityLabel).startsWith('Announce the passing'))).toBe(false);
  });

  it('flag on: a tap on a locked card opens the placeholder and does not pick the template; Close shuts it', () => {
    const flow = setup(true);
    expect(modal().props.visible).toBe(false);
    fireEvent.press(screen.getByText('Thank-you note'));
    expect(flow.setTemplate).not.toHaveBeenCalled();
    expect(modal().props.visible).toBe(true);
    expect(screen.getByText('Payment details will go here.')).toBeTruthy();
    fireEvent.press(screen.getByRole('button', { name: 'Close' }));
    expect(modal().props.visible).toBe(false);
  });

  it('flag on: after the placeholder is dismissed, screen-reader focus goes back to the card', () => {
    const focus = jest.spyOn(AccessibilityInfo, 'setAccessibilityFocus').mockImplementation(() => undefined);
    setup(true);
    fireEvent.press(screen.getByText('Share the service'));
    act(() => modal().props.onDismiss());
    expect(focus).toHaveBeenCalledWith(1);
  });

  it('flag on: an announcement card still picks its template', () => {
    const flow = setup(true);
    fireEvent.press(screen.getByText('Announce the passing'));
    expect(flow.setTemplate).toHaveBeenCalledTimes(1);
  });
});
