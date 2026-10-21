import { describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render, screen } from '@testing-library/react-native';
import type { Contact } from '@griever/shared';
import type { UseContactsResult } from '@griever/hooks';
import { ContactSelectorScreen } from './ContactSelectorScreen';

jest.mock('../lib/expoContactsSource', () => ({ expoContactsSource: {} }));

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

function renderScreen(contactList: Contact[] = saved, templateCategory: string | null = 'announcement') {
  const toggleContact = jest.fn();
  const flow = {
    selectedContactIds: [] as string[],
    toggleContact,
    nextStep: jest.fn(),
    prevStep: jest.fn(),
    templateCategory,
  };
  const contacts = { contacts: contactList, loading: false } as unknown as UseContactsResult;
  render(<ContactSelectorScreen flow={flow as never} contacts={contacts} />);
  return { toggleContact };
}

const headers = () => screen.queryAllByRole('header').map((h) => h.props.children);

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
    expect(screen.getByText('No recipients selected')).toBeTruthy();
    expect(toggleContact).not.toHaveBeenCalled();
    fireEvent.press(screen.getByText('Mum'));
    expect(toggleContact).toHaveBeenCalledTimes(1);
    expect(toggleContact).toHaveBeenCalledWith('2');
  });
});
