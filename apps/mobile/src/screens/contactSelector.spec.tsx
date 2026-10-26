import { describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import type { Contact } from '@griever/shared';
import type { UseContactsResult } from '@griever/hooks';
import { ContactSelectorScreen } from './ContactSelectorScreen';

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

  it('gives the Bring people across rows the checkbox role and checked state', async () => {
    renderScreen();
    fireEvent.press(screen.getByRole('button', { name: 'Bring people across' }));
    await waitFor(() => expect(screen.getByText('Bring people across')).toBeTruthy());
    expect(screen.getByRole('checkbox', { name: /Starred Sam/, checked: true })).toBeTruthy();
    const plain = screen.getByRole('checkbox', { name: /Plain Pat/, checked: false });
    fireEvent.press(plain);
    expect(screen.getByRole('checkbox', { name: /Plain Pat/, checked: true })).toBeTruthy();
    const ticks = screen.getAllByText('✓', { includeHiddenElements: true });
    expect(ticks).toHaveLength(2);
    ticks.forEach((t) => expect(t.props.accessibilityElementsHidden).toBe(true));
  });
});
