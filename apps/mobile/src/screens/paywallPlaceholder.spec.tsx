import { describe, expect, it, jest } from '@jest/globals';
import { Modal } from 'react-native';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { PaywallPlaceholder } from './PaywallPlaceholder';

const modal = () => screen.UNSAFE_getByType(Modal);

describe('PaywallPlaceholder (#292)', () => {
  it('is hidden until visible, then a modal with the heading, one line and a Close button', () => {
    const { rerender } = render(<PaywallPlaceholder visible={false} onClose={jest.fn()} />);
    expect(modal().props.visible).toBe(false);
    rerender(<PaywallPlaceholder visible onClose={jest.fn()} />);
    expect(modal().props.visible).toBe(true);
    expect(screen.getByRole('header', { name: 'The full plan' })).toBeTruthy();
    expect(screen.getByText('Payment details will go here.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Close' })).toBeTruthy();
    expect(screen.UNSAFE_getByProps({ accessibilityViewIsModal: true })).toBeTruthy();
  });

  it('closes with the Close button', () => {
    const onClose = jest.fn();
    render(<PaywallPlaceholder visible onClose={onClose} />);
    fireEvent.press(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes on the Android Back gesture (onRequestClose)', () => {
    const onClose = jest.fn();
    render(<PaywallPlaceholder visible onClose={onClose} />);
    act(() => modal().props.onRequestClose());
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('uses no exclamation points', () => {
    render(<PaywallPlaceholder visible onClose={jest.fn()} />);
    expect(JSON.stringify(screen.toJSON())).not.toContain('!');
  });
});
