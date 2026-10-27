import { describe, expect, it, jest } from '@jest/globals';
import { StyleSheet } from 'react-native';
import { fireEvent, render, screen, within } from '@testing-library/react-native';
import type { Session } from '@griever/hooks';
import { colors } from '@griever/tokens';
import { HomeScreen } from './HomeScreen';

const anna = {
  id: 'a', flowId: 'f', ownerId: null, role: 'owner', personName: 'Anna', dateOfPassing: '', senderName: '', obituaryUrl: '',
  createdAt: '2026-01-01', lastOpenedAt: '2026-01-01', drafts: {}, serviceReady: false, recipientsNotified: {}, momentCompletedAt: {}, remindersScheduled: [],
} as unknown as Session;

const props = { sessions: [anna], canCreate: true, onOpen: jest.fn(), onCreate: jest.fn(), onAccount: jest.fn(), onImportContacts: jest.fn() };

const flat = (el: { props: { style?: unknown } }) => StyleSheet.flatten(el.props.style as never) as Record<string, unknown>;

const buttonNames = () =>
  screen.getAllByRole('button').map((b) => (b.props.accessibilityLabel as string | undefined) ?? within(b).getByText(/./).props.children);

describe('HomeScreen layout (#363)', () => {
  it('puts "Your account" right after "Someone else I\'ve lost" in reading order', () => {
    render(<HomeScreen {...props} />);
    const add = screen.getAllByRole('button').indexOf(screen.getByRole('button', { name: "Someone else I've lost" }));
    expect(add).toBeGreaterThan(-1);
    expect(screen.getAllByRole('button')[add + 1]).toBe(screen.getByRole('button', { name: 'Your account' }));
  });

  it('with no people, the buttons are Start with someone, then Your account', () => {
    render(<HomeScreen {...props} sessions={[]} />);
    expect(buttonNames()).toEqual(["Start with someone I've lost", 'Your account', 'Add from your contacts']);
    expect(screen.getByText('No one here yet.')).toBeTruthy();
  });

  it('with accounts off there is no Your account button', () => {
    render(<HomeScreen {...props} onAccount={undefined} />);
    expect(screen.queryByRole('button', { name: 'Your account' })).toBeNull();
  });

  it('draws "Your account" as the header outline with no fill', () => {
    render(<HomeScreen {...props} />);
    const style = flat(screen.getByRole('button', { name: 'Your account' }));
    expect(style.borderWidth).toBeGreaterThan(0);
    expect(style.borderColor).toBe(colors['accent-600']);
    expect(style.backgroundColor ?? 'transparent').toBe('transparent');
  });

  it('draws a person title in ink, 17px, semibold', () => {
    render(<HomeScreen {...props} />);
    const style = flat(screen.getByText('Anna'));
    expect(style.color).toBe(colors.ink);
    expect(style.fontSize).toBe(17);
    expect(style.fontFamily).toBe('SourceSerif4_600SemiBold');
  });

  it('washes a person row accent-100 while pressed', () => {
    render(<HomeScreen {...props} />);
    const row = screen.getByRole('button', { name: 'Anna' });
    expect(flat(row).backgroundColor).toBe(colors.surface);
    fireEvent(row, 'responderGrant', { nativeEvent: { touches: [], changedTouches: [] }, persist: () => undefined });
    expect(flat(screen.getByRole('button', { name: 'Anna' })).backgroundColor).toBe(colors['accent-100']);
  });

  it('uses the token page colour for the screen background', () => {
    const { toJSON } = render(<HomeScreen {...props} />);
    const root = toJSON() as { props: { style?: unknown } };
    expect(flat(root).backgroundColor).toBe(colors.bg);
  });
});

describe('HomeScreen import button (#379)', () => {
  it('orders the buttons: create, Your account, Add from your contacts', () => {
    render(<HomeScreen {...props} />);
    expect(buttonNames().slice(-3)).toEqual(["Someone else I've lost", 'Your account', 'Add from your contacts']);
  });

  it('draws both as full-width header outlines', () => {
    render(<HomeScreen {...props} />);
    for (const [name, row] of [['Your account', 'home-account-row'], ['Add from your contacts', 'home-import-row']]) {
      const button = screen.getByRole('button', { name });
      expect(flat(button).borderColor).toBe(colors['accent-600']);
      expect(flat(button).backgroundColor ?? 'transparent').toBe('transparent');
      expect(flat(screen.getByTestId(row)).width).toBe('100%');
    }
  });

  it('gives the create button room above Your account', () => {
    render(<HomeScreen {...props} />);
    const gap = flat(screen.getByTestId('home-account-row')).marginTop as number;
    expect(gap).toBeGreaterThanOrEqual(24);
  });

  it('calls the import handler when pressed', () => {
    const onImportContacts = jest.fn();
    render(<HomeScreen {...props} onImportContacts={onImportContacts} />);
    fireEvent.press(screen.getByRole('button', { name: 'Add from your contacts' }));
    expect(onImportContacts).toHaveBeenCalledTimes(1);
  });

  it('shows the import button with accounts off too', () => {
    render(<HomeScreen {...props} onAccount={undefined} />);
    expect(screen.getByRole('button', { name: 'Add from your contacts' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Your account' })).toBeNull();
  });
});
