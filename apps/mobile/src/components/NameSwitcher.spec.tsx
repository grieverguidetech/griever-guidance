import { describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render, screen, within } from '@testing-library/react-native';
import { Modal } from 'react-native';
import type { Session } from '@griever/hooks';
import { NameSwitcher } from './NameSwitcher';

const person = (id: string, personName: string, lastOpenedAt: string) => ({ id, personName, lastOpenedAt, drafts: {} }) as unknown as Session;

const anna = person('a', 'Anna', '2026-10-01T00:00:00.000Z');
const ben = person('b', 'Ben', '2026-10-03T00:00:00.000Z');
const cora = person('c', 'Cora', '2026-10-02T00:00:00.000Z');

const sheet = () => screen.UNSAFE_getByType(Modal);

describe('NameSwitcher', () => {
  it('with no other people, the name is plain text with the label, and not a button', () => {
    render(<NameSwitcher name="Dan" others={[]} onPick={jest.fn()} onAdd={jest.fn()} />);
    expect(screen.getByLabelText('Writing about Dan')).toBeTruthy();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('with other people, the name is a button with the label, and the sheet is closed', () => {
    render(<NameSwitcher name="Dan" others={[anna]} onPick={jest.fn()} onAdd={jest.fn()} />);
    expect(screen.getByRole('button', { name: 'Writing about Dan' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Anna' })).toBeNull();
  });

  it('lists the others newest first, then Add someone, and nothing that deletes or removes', () => {
    render(<NameSwitcher name="Dan" others={[anna, ben, cora]} onPick={jest.fn()} onAdd={jest.fn()} />);
    fireEvent.press(screen.getByRole('button', { name: 'Writing about Dan' }));
    const names = within(sheet()).getAllByRole('button').map((b) => within(b).getByText(/.+/).props.children);
    expect(names).toEqual(['Close', 'Ben', 'Cora', 'Anna', 'Add someone']);
    expect(screen.queryByText(/delete|remove/i)).toBeNull();
  });

  it('does not change the list it is given', () => {
    const others = [anna, ben];
    render(<NameSwitcher name="Dan" others={others} onPick={jest.fn()} />);
    fireEvent.press(screen.getByRole('button', { name: 'Writing about Dan' }));
    expect(others).toEqual([anna, ben]);
  });

  it('picking a person calls onPick with their id and closes the sheet', () => {
    const onPick = jest.fn();
    render(<NameSwitcher name="Dan" others={[anna, ben]} onPick={onPick} onAdd={jest.fn()} />);
    fireEvent.press(screen.getByRole('button', { name: 'Writing about Dan' }));
    fireEvent.press(screen.getByRole('button', { name: 'Anna' }));
    expect(onPick).toHaveBeenCalledWith('a');
    expect(sheet().props.visible).toBe(false);
  });

  it('Add someone calls onAdd and closes the sheet', () => {
    const onAdd = jest.fn();
    render(<NameSwitcher name="Dan" others={[anna]} onPick={jest.fn()} onAdd={onAdd} />);
    fireEvent.press(screen.getByRole('button', { name: 'Writing about Dan' }));
    fireEvent.press(screen.getByRole('button', { name: 'Add someone' }));
    expect(onAdd).toHaveBeenCalledTimes(1);
    expect(sheet().props.visible).toBe(false);
  });

  it('leaves Add someone out when no onAdd is given (the user cannot create a person)', () => {
    render(<NameSwitcher name="Dan" others={[anna]} onPick={jest.fn()} />);
    fireEvent.press(screen.getByRole('button', { name: 'Writing about Dan' }));
    expect(screen.getByRole('button', { name: 'Anna' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Add someone' })).toBeNull();
  });

  it('Close and the Back request both shut the sheet without picking anyone', () => {
    const onPick = jest.fn();
    render(<NameSwitcher name="Dan" others={[anna]} onPick={onPick} />);
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
