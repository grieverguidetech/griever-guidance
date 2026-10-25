import { describe, expect, it, jest } from '@jest/globals';
import { Modal } from 'react-native';
import { fireEvent, render, screen, within } from '@testing-library/react-native';
import { TemplatePickerScreen } from './TemplatePickerScreen';
import type { FlowProps } from '../app/App';

jest.mock('@react-navigation/native', () => ({ useNavigation: () => ({ navigate: jest.fn() }) }));

const setup = (paymentsEnabled: boolean) => {
  const flow = { setTemplate: jest.fn(), nextStep: jest.fn() };
  render(<TemplatePickerScreen flow={flow as unknown as FlowProps['flow']} paymentsEnabled={paymentsEnabled} />);
  return flow;
};
const modal = () => screen.UNSAFE_getByType(Modal);
const lockedCards = () => screen.queryAllByRole('button').filter((b) => b.props.accessibilityState?.disabled === true && b.props.accessibilityHint);

describe('TemplatePickerScreen paywall demo (#292)', () => {
  it('flag off: nothing is locked, a card picks its template, and no reason is shown', () => {
    const flow = setup(false);
    expect(lockedCards()).toHaveLength(0);
    expect(screen.queryByText('Included with the full plan')).toBeNull();
    fireEvent.press(screen.getByText('Share the service'));
    expect(flow.setTemplate).toHaveBeenCalledTimes(1);
    expect(flow.nextStep).toHaveBeenCalledTimes(1);
    expect(modal().props.visible).toBe(false);
  });

  it('flag on: announcement cards stay open; service and aftercare cards are locked with a hint', () => {
    setup(true);
    expect(lockedCards()).toHaveLength(2);
    for (const card of lockedCards()) {
      expect(card.props.accessibilityHint).toBe('Included with the full plan');
    }
    expect(screen.getAllByText('Included with the full plan')).toHaveLength(2);
    for (const open of ['Announce the passing']) {
      expect(lockedCards().some((c) => within(c).queryByText(open) !== null)).toBe(false);
    }
    for (const shut of ['Share the service', 'Thank-you note']) {
      expect(lockedCards().some((c) => within(c).queryByText(shut) !== null)).toBe(true);
    }
  });

  it('flag on: a tap on a locked card opens the placeholder and does not pick the template; Close shuts it', () => {
    const flow = setup(true);
    fireEvent.press(screen.getByText('Thank-you note'));
    expect(flow.setTemplate).not.toHaveBeenCalled();
    expect(modal().props.visible).toBe(true);
    expect(screen.getByText('Payment details will go here.')).toBeTruthy();
    fireEvent.press(screen.getByRole('button', { name: 'Close' }));
    expect(modal().props.visible).toBe(false);
  });

  it('flag on: an announcement card still picks its template', () => {
    const flow = setup(true);
    fireEvent.press(screen.getByText('Announce the passing'));
    expect(flow.setTemplate).toHaveBeenCalledTimes(1);
  });
});
