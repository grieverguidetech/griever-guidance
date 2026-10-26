import { describe, expect, it, jest } from '@jest/globals';
import { StyleSheet } from 'react-native';
import { render, screen, within } from '@testing-library/react-native';
import type { Session } from '@griever/hooks';
import { colors } from '@griever/tokens';
import { HomeScreen } from './HomeScreen';

const anna = {
  id: 'a', flowId: 'f', ownerId: null, role: 'owner', personName: 'Anna', dateOfPassing: '', senderName: '', obituaryUrl: '',
  createdAt: '2026-01-01', lastOpenedAt: '2026-01-01', drafts: {}, serviceReady: false, recipientsNotified: {}, momentCompletedAt: {}, remindersScheduled: [],
} as unknown as Session;

const props = { sessions: [anna], canCreate: true, onOpen: jest.fn(), onCreate: jest.fn(), onAccount: jest.fn() };

const flat = (el: { props: { style?: unknown } }) => StyleSheet.flatten(el.props.style as never) as Record<string, unknown>;

describe('HomeScreen layout (#363)', () => {
  it('puts "Your account" right after "Someone else I\'ve lost" in reading order', () => {
    render(<HomeScreen {...props} />);
    const names = screen
      .getAllByRole('button')
      .map((b) => (b.props.accessibilityLabel as string | undefined) ?? within(b).getByText(/./).props.children);
    const add = names.indexOf("Someone else I've lost");
    expect(add).toBeGreaterThan(-1);
    expect(names[add + 1]).toBe('Your account');
  });

  it('draws "Your account" as an outline with no fill', () => {
    render(<HomeScreen {...props} />);
    const style = flat(screen.getByRole('button', { name: 'Your account' }));
    expect(style.borderWidth).toBeGreaterThan(0);
    expect(style.borderColor).toBeTruthy();
    expect(style.backgroundColor ?? 'transparent').toBe('transparent');
  });

  it('uses the token page colour for the screen background', () => {
    const { toJSON } = render(<HomeScreen {...props} />);
    const root = toJSON() as { props: { style?: unknown } };
    expect(flat(root).backgroundColor).toBe(colors.bg);
  });
});
