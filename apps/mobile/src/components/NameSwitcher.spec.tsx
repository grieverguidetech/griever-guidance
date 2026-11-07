import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { act, fireEvent, render, screen, within } from '@testing-library/react-native';
import { Modal, Platform } from 'react-native';
import type { Session } from '@griever/hooks';
import { NameSwitcher } from './NameSwitcher';

const person = (id: string, personName: string, lastOpenedAt: string) => ({ id, personName, lastOpenedAt, drafts: {} }) as unknown as Session;

const anna = person('a', 'Anna', '2026-10-01T00:00:00.000Z');
const ben = person('b', 'Ben', '2026-10-03T00:00:00.000Z');
const cora = person('c', 'Cora', '2026-10-02T00:00:00.000Z');

const sheet = () => screen.UNSAFE_getByType(Modal);

afterEach(() => {
  jest.useRealTimers();
  jest.clearAllMocks();
});

describe('NameSwitcher', () => {
  it('with one person, the name is a button with the label that opens the sheet with Edit person and Add someone', () => {
    render(<NameSwitcher name="Dan" onEdit={jest.fn()} others={[]} onPick={jest.fn()} onAdd={jest.fn()} />);
    fireEvent.press(screen.getByRole('button', { name: 'Writing about Dan' }));
    expect(sheet().props.visible).toBe(true);
    const names = within(sheet()).getAllByRole('button').map((b) => within(b).getByText(/.+/).props.children);
    expect(names).toEqual(['Close', 'Edit person', 'Add someone']);
    expect(screen.queryByText(/delete|remove/i)).toBeNull();
  });

  it('iOS: Edit person closes the sheet, and onEdit runs once, only when the sheet is gone', () => {
    const onEdit = jest.fn();
    render(<NameSwitcher name="Dan" onEdit={onEdit} others={[]} onPick={jest.fn()} />);
    fireEvent.press(screen.getByRole('button', { name: 'Writing about Dan' }));
    fireEvent.press(screen.getByRole('button', { name: 'Edit person' }));
    expect(sheet().props.visible).toBe(false);
    expect(onEdit).not.toHaveBeenCalled();
    act(() => sheet().props.onDismiss());
    act(() => sheet().props.onDismiss());
    expect(onEdit).toHaveBeenCalledTimes(1);
  });

  it('Android: Edit person runs a moment after the sheet closes', () => {
    const original = Platform.OS;
    Platform.OS = 'android';
    jest.useFakeTimers();
    const onEdit = jest.fn();
    render(<NameSwitcher name="Dan" onEdit={onEdit} others={[]} onPick={jest.fn()} />);
    fireEvent.press(screen.getByRole('button', { name: 'Writing about Dan' }));
    fireEvent.press(screen.getByRole('button', { name: 'Edit person' }));
    expect(onEdit).not.toHaveBeenCalled();
    act(() => {
      jest.advanceTimersByTime(10);
    });
    Platform.OS = original;
    expect(onEdit).toHaveBeenCalledTimes(1);
  });

  it('for a member (no onAdd) with one person, the sheet has Edit person and no Add someone', () => {
    render(<NameSwitcher name="Dan" onEdit={jest.fn()} others={[]} onPick={jest.fn()} />);
    fireEvent.press(screen.getByRole('button', { name: 'Writing about Dan' }));
    expect(screen.getByRole('button', { name: 'Edit person' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Add someone' })).toBeNull();
  });

  it('with other people, the name is a button with the label, and the sheet is closed', () => {
    render(<NameSwitcher name="Dan" onEdit={jest.fn()} others={[anna]} onPick={jest.fn()} onAdd={jest.fn()} />);
    expect(screen.getByRole('button', { name: 'Writing about Dan' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Anna' })).toBeNull();
  });

  it('lists the others newest first, then Add someone, and nothing that deletes or removes', () => {
    render(<NameSwitcher name="Dan" onEdit={jest.fn()} others={[anna, ben, cora]} onPick={jest.fn()} onAdd={jest.fn()} />);
    fireEvent.press(screen.getByRole('button', { name: 'Writing about Dan' }));
    const names = within(sheet()).getAllByRole('button').map((b) => within(b).getByText(/.+/).props.children);
    expect(names).toEqual(['Close', 'Edit person', 'Ben', 'Cora', 'Anna', 'Add someone']);
    expect(screen.queryByText(/delete|remove/i)).toBeNull();
  });

  it('does not change the list it is given', () => {
    const others = [anna, ben];
    render(<NameSwitcher name="Dan" onEdit={jest.fn()} others={others} onPick={jest.fn()} />);
    fireEvent.press(screen.getByRole('button', { name: 'Writing about Dan' }));
    expect(others).toEqual([anna, ben]);
  });

  it('iOS: picking a person closes the sheet, and onPick runs only once the sheet is gone', () => {
    const onPick = jest.fn();
    render(<NameSwitcher name="Dan" onEdit={jest.fn()} others={[anna, ben]} onPick={onPick} onAdd={jest.fn()} />);
    fireEvent.press(screen.getByRole('button', { name: 'Writing about Dan' }));
    fireEvent.press(screen.getByRole('button', { name: 'Anna' }));
    expect(sheet().props.visible).toBe(false);
    expect(onPick).not.toHaveBeenCalled();
    act(() => sheet().props.onDismiss());
    expect(onPick).toHaveBeenCalledTimes(1);
    expect(onPick).toHaveBeenCalledWith('a');
    // A later dismiss does not run it again.
    act(() => sheet().props.onDismiss());
    expect(onPick).toHaveBeenCalledTimes(1);
  });

  it('iOS: Add someone closes the sheet, and onAdd runs only once the sheet is gone', () => {
    const onAdd = jest.fn();
    render(<NameSwitcher name="Dan" onEdit={jest.fn()} others={[anna]} onPick={jest.fn()} onAdd={onAdd} />);
    fireEvent.press(screen.getByRole('button', { name: 'Writing about Dan' }));
    fireEvent.press(screen.getByRole('button', { name: 'Add someone' }));
    expect(sheet().props.visible).toBe(false);
    expect(onAdd).not.toHaveBeenCalled();
    act(() => sheet().props.onDismiss());
    expect(onAdd).toHaveBeenCalledTimes(1);
  });

  it('Android: onPick and onAdd run a moment after the sheet closes, once each', () => {
    const original = Platform.OS;
    Platform.OS = 'android';
    jest.useFakeTimers();
    const onPick = jest.fn();
    const onAdd = jest.fn();
    render(<NameSwitcher name="Dan" onEdit={jest.fn()} others={[anna]} onPick={onPick} onAdd={onAdd} />);
    fireEvent.press(screen.getByRole('button', { name: 'Writing about Dan' }));
    fireEvent.press(screen.getByRole('button', { name: 'Anna' }));
    expect(onPick).not.toHaveBeenCalled();
    act(() => {
      jest.advanceTimersByTime(10);
    });
    expect(onPick).toHaveBeenCalledWith('a');
    fireEvent.press(screen.getByRole('button', { name: 'Writing about Dan' }));
    fireEvent.press(screen.getByRole('button', { name: 'Add someone' }));
    expect(onAdd).not.toHaveBeenCalled();
    act(() => {
      jest.advanceTimersByTime(10);
    });
    Platform.OS = original;
    expect(onAdd).toHaveBeenCalledTimes(1);
    expect(onPick).toHaveBeenCalledTimes(1);
  });

  it('the name button has a hidden arrow and is at least 44 wide', () => {
    render(<NameSwitcher name="Dan" onEdit={jest.fn()} others={[anna]} onPick={jest.fn()} />);
    const button = screen.getByRole('button', { name: 'Writing about Dan' });
    expect(screen.getByText('⌄', { includeHiddenElements: true }).props.accessibilityElementsHidden).toBe(true);
    const style = typeof button.props.style === 'function' ? button.props.style({ pressed: false }) : button.props.style;
    expect(JSON.stringify(style)).toContain('"minWidth":44');
  });

  it('leaves Add someone out when no onAdd is given (the user cannot create a person)', () => {
    render(<NameSwitcher name="Dan" onEdit={jest.fn()} others={[anna]} onPick={jest.fn()} />);
    fireEvent.press(screen.getByRole('button', { name: 'Writing about Dan' }));
    expect(screen.getByRole('button', { name: 'Anna' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Add someone' })).toBeNull();
  });

  it('Close and the Back request both shut the sheet without picking anyone', () => {
    const onPick = jest.fn();
    render(<NameSwitcher name="Dan" onEdit={jest.fn()} others={[anna]} onPick={onPick} />);
    fireEvent.press(screen.getByRole('button', { name: 'Writing about Dan' }));
    fireEvent.press(screen.getByRole('button', { name: 'Close' }));
    expect(sheet().props.visible).toBe(false);
    fireEvent.press(screen.getByRole('button', { name: 'Writing about Dan' }));
    expect(sheet().props.visible).toBe(true);
    fireEvent(sheet(), 'requestClose');
    expect(sheet().props.visible).toBe(false);
    expect(onPick).not.toHaveBeenCalled();
  });
});
