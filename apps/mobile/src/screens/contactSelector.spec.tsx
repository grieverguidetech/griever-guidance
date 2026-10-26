import { describe, expect, it, jest } from '@jest/globals';
import { AccessibilityInfo } from 'react-native';
import { fireEvent, render, screen } from '@testing-library/react-native';
import type { Contact } from '@griever/shared';
import type { UseContactsResult } from '@griever/hooks';
import { ContactSelectorScreen } from './ContactSelectorScreen';

// Jest has no native view tree, so findNodeHandle returns null. A fake handle lets the test see focus sent.
jest.mock('react-native/Libraries/ReactNative/RendererProxy', () => ({
  ...jest.requireActual<object>('react-native/Libraries/ReactNative/RendererProxy'),
  findNodeHandle: () => 1,
}));

jest.mock('../lib/expoContactsSource', () => ({
  expoContactsSource: {
    id: 'native',
    preselected: false,
    isAvailable: async () => true,
    fetch: async () => [
      { key: 'x', displayName: 'Starred Sam', phones: ['+16175550111'], emails: [], starred: true },
      { key: 'y', displayName: 'Plain Pat', phones: ['+16175550112'], emails: [] },
    ],
  },
}));

const make = (id: string, name: string, tier: Contact['tier']): Contact => ({
  contactId: id,
  name,
  phone: `+1617555${id.padStart(4, '0')}`,
  email: null,
  tier,
  source: 'manual',
  createdAt: 0,
});

// Saved order puts a friend first, so the screen has to do the reordering.
const saved = [
  make('1', 'Neighbour Ned', 'family'),
  make('2', 'Mum', 'first'),
  make('3', 'Cousin Cat', 'family'),
  make('4', 'Dad', 'first'),
];

function renderScreen(
  contactList: Contact[] = saved,
  templateCategory: string | null = 'announcement',
  selectedContactIds: string[] = [],
) {
  const toggleContact = jest.fn();
  const flow = {
    selectedContactIds,
    toggleContact,
    nextStep: jest.fn(),
    prevStep: jest.fn(),
    templateCategory,
  };
  const contacts = { contacts: contactList, loading: false } as unknown as UseContactsResult;
  const ui = (ids: string[]) => (
    <ContactSelectorScreen flow={{ ...flow, selectedContactIds: ids } as never} contacts={contacts} />
  );
  const { rerender } = render(ui(selectedContactIds));
  return { toggleContact, rerender: (ids: string[]) => rerender(ui(ids)) };
}

// The screen's own title is a heading too; the tier headings are the rest.
const headers = () =>
  screen
    .queryAllByRole('heading')
    .map((h) => h.props.children)
    .filter((text) => text !== 'Who should know?');

describe('ContactSelectorScreen grouping', () => {
  it('for an announcement, lists Close family before Friends & family, with headings as headers', () => {
    renderScreen();
    expect(headers()).toEqual(['Close family', 'Friends & family']);
    const rendered = screen
      .getAllByText(/^(Close family|Friends & family|Mum|Dad|Neighbour Ned|Cousin Cat)$/)
      .map((n) => n.props.children);
    expect(rendered).toEqual(['Close family', 'Mum', 'Dad', 'Friends & family', 'Neighbour Ned', 'Cousin Cat']);
  });

  it('shows a plain list in saved order, with no headings, for other templates', () => {
    renderScreen(saved, 'death');
    expect(headers()).toEqual([]);
    const rendered = screen.getAllByText(/^(Mum|Dad|Neighbour Ned|Cousin Cat)$/).map((n) => n.props.children);
    expect(rendered).toEqual(['Neighbour Ned', 'Mum', 'Cousin Cat', 'Dad']);
  });

  it('hides the heading when only one group has people', () => {
    renderScreen([make('1', 'Neighbour Ned', 'family'), make('3', 'Cousin Cat', 'family')]);
    expect(headers()).toEqual([]);
    expect(screen.getByText('Neighbour Ned')).toBeTruthy();
  });

  it('preselects no one and sends nothing until the user picks', () => {
    const { toggleContact } = renderScreen();
    expect(screen.getByText('0 selected')).toBeTruthy();
    expect(toggleContact).not.toHaveBeenCalled();
    fireEvent.press(screen.getByText('Mum'));
    expect(toggleContact).toHaveBeenCalledTimes(1);
    expect(toggleContact).toHaveBeenCalledWith('2');
  });

  it('gives each row the checkbox role and its checked state', () => {
    renderScreen(saved, 'announcement', ['2']);
    const rows = screen.getAllByRole('checkbox');
    expect(rows).toHaveLength(4);
    expect(screen.getByRole('checkbox', { name: /Mum/, checked: true })).toBeTruthy();
    expect(screen.getByRole('checkbox', { name: /Dad/, checked: false })).toBeTruthy();
  });

  it('updates the checked state when the selection changes', () => {
    const { rerender } = renderScreen();
    expect(screen.getByRole('checkbox', { name: /Mum/, checked: false })).toBeTruthy();
    rerender(['2']);
    expect(screen.getByRole('checkbox', { name: /Mum/, checked: true })).toBeTruthy();
  });

  it('hides the tick glyph from screen readers so the state is read once', () => {
    renderScreen(saved, 'announcement', ['2']);
    const tick = screen.getByText('✓', { includeHiddenElements: true });
    expect(tick.props.accessibilityElementsHidden).toBe(true);
    expect(tick.props.importantForAccessibility).toBe('no-hide-descendants');
  });

  it('gives the Add from your contacts rows the checkbox role and checked state', async () => {
    renderScreen();
    fireEvent.press(screen.getByRole('button', { name: 'Add from your contacts' }));
    expect(await screen.findByRole('checkbox', { name: /Starred Sam/, checked: true })).toBeTruthy();
    expect(screen.getByText('Choose only the ones you want — the rest stay where they are.')).toBeTruthy();
    const plain = screen.getByRole('checkbox', { name: /Plain Pat/, checked: false });
    fireEvent.press(plain);
    expect(screen.getByRole('checkbox', { name: /Plain Pat/, checked: true })).toBeTruthy();
    const ticks = screen.getAllByText('✓', { includeHiddenElements: true });
    expect(ticks).toHaveLength(2);
    ticks.forEach((t) => expect(t.props.accessibilityElementsHidden).toBe(true));
  });

  it('titles the import review "Add from your contacts" and Back returns to the list', async () => {
    renderScreen();
    fireEvent.press(screen.getByRole('button', { name: 'Add from your contacts' }));
    expect(await screen.findByRole('heading', { name: 'Add from your contacts' })).toBeTruthy();
    fireEvent.press(screen.getByRole('button', { name: 'Back' }));
    expect(await screen.findByText('Who should know?')).toBeTruthy();
    expect(screen.queryByText('Starred Sam')).toBeNull();
  });

  it('moves focus to the review heading on the way in, and back to the import button on Back', async () => {
    const focus = jest.spyOn(AccessibilityInfo, 'setAccessibilityFocus').mockImplementation(() => undefined);
    renderScreen();
    focus.mockClear();
    fireEvent.press(screen.getByRole('button', { name: 'Add from your contacts' }));
    await screen.findByRole('heading', { name: 'Add from your contacts' });
    expect(focus).toHaveBeenCalledTimes(1);
    focus.mockClear();
    fireEvent.press(screen.getByRole('button', { name: 'Back' }));
    await screen.findByText('Who should know?');
    expect(focus).toHaveBeenCalledTimes(1);
  });

  it('shows why Add is unavailable in the review until someone is chosen', async () => {
    renderScreen();
    fireEvent.press(screen.getByRole('button', { name: 'Add from your contacts' }));
    await screen.findByRole('heading', { name: 'Add from your contacts' });
    fireEvent.press(screen.getByRole('checkbox', { name: /Starred Sam/, checked: true }));
    expect(screen.getByText('Choose at least one person', { includeHiddenElements: true })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Add' }).props.accessibilityHint).toBe('Choose at least one person');
  });

  it('reads Continue as disabled until someone is chosen, and says why', () => {
    renderScreen();
    const cont = screen.getByRole('button', { name: 'Continue' });
    expect(cont.props.accessibilityState).toEqual(expect.objectContaining({ disabled: true }));
    expect(cont.props.accessibilityHint).toBe('Choose at least one person');
  });

  it('announces the new count when the selection changes', () => {
    const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => undefined);
    const { rerender } = renderScreen();
    announce.mockClear();
    rerender(['2']);
    expect(announce).toHaveBeenCalledWith('1 selected');
  });
});
