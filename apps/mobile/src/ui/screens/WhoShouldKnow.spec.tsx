import { describe, expect, it, jest } from '@jest/globals';
import { act, fireEvent, render, screen, within } from '@testing-library/react-native';
import { WhoShouldKnow } from './WhoShouldKnow';
import type { WhoShouldKnowCopy, WhoShouldKnowProps } from './WhoShouldKnow';

const copy: WhoShouldKnowCopy = {
  heading: 'Who should know?',
  introGrouped: "Send to close family now, everyone else when you're ready.",
  introUngrouped: 'Select everyone who should get this.',
  back: 'Back',
  checklist: "What you'll need",
  tierFirst: 'Close family',
  tierFamily: 'Friends & family',
  selectAll: 'Select all',
  selectAllFor: 'Select all, {group}',
  chooseOne: 'Choose at least one person',
  noneYet: 'No one picked? You can share it to a group or by email next.',
  fillBoth: 'Enter a name and a mobile number',
  addAnother: 'Add another person',
  nameLabel: 'Name',
  namePlaceholder: 'e.g. Aunt Carol',
  phoneLabel: 'Mobile number',
  phonePlaceholder: '(617) 555-0148',
  add: 'Add',
  cancel: 'Cancel',
  badNumber: "That number doesn't look right — check the area code and digits.",
  continue: 'Continue',
  empty: 'No one saved yet. Add someone below.',
  bringAcross: 'Add from your contacts',
  searchLabel: 'Search by name',
  searchEmpty: 'No one matches that name.',
  selectAllShown: 'Select all shown',
  blockedLine: 'Contacts are turned off for this app. You can add people yourself, or turn them on in Settings.',
  openSettings: 'Open Settings',
  bringAcrossBusy: 'Reading your contacts…',
  loadingPeople: 'Getting your people…',
  sent: 'Sent',
  saveFailed: 'We could not save that. Please try again.',
  saving: 'Saving…',
};

const people = [
  { id: 'a', name: 'Aunt Carol', phone: '(617) 555-0148', tier: 'first' as const },
  { id: 'b', name: 'Bob Smith', phone: '(617) 555-0149', tier: 'family' as const },
  { id: 'c', name: 'Cat Jones', phone: '(617) 555-0150', tier: 'family' as const },
];

function setup(over: Partial<WhoShouldKnowProps> = {}) {
  const handlers = {
    onBack: jest.fn(),
    onToggle: jest.fn(),
    onSelectAll: jest.fn(),
    onContinue: jest.fn(),
    onAddPerson: jest.fn(async () => undefined),
    toE164: jest.fn((raw: string) => (raw.replace(/\D/g, '').length >= 10 ? '+16175550148' : null)),
  };
  const count = (over.selectedIds ?? []).length;
  render(
    <WhoShouldKnow copy={copy} people={people} grouped selectedIds={[]} selectedLabel={`${count} selected`} {...handlers} {...over} />,
  );
  return handlers;
}

describe('WhoShouldKnow (mobile props, #652)', () => {
  it('tags the people already sent, and nobody else, and the tag is part of the row name', () => {
    setup({ grouped: false, toldIds: ['b'] });
    expect(screen.getAllByText('Sent')).toHaveLength(1);
    expect(within(screen.getByRole('checkbox', { name: /Bob Smith/ })).getByText('Sent')).toBeTruthy();
    expect(screen.getAllByRole('checkbox', { name: /Sent/ })).toHaveLength(1);
    expect(within(screen.getByRole('checkbox', { name: /Aunt Carol/ })).queryByText('Sent')).toBeNull();
  });

  it('shows no Sent tag when the prop is not passed', () => {
    setup({ grouped: false });
    expect(screen.queryByText('Sent')).toBeNull();
  });

  it('shows a muted loading line while the saved people load, and no empty line', () => {
    setup({ grouped: false, people: [], loading: true });
    expect(screen.getByText('Getting your people…')).toBeTruthy();
    expect(screen.queryByText('No one saved yet. Add someone below.')).toBeNull();
  });

  it('shows the blocked line and Open Settings, and keeps the import button', () => {
    const onOpenSettings = jest.fn();
    const onPress = jest.fn();
    setup({ grouped: false, bringAcross: { onPress, blocked: { onOpenSettings } } });
    expect(screen.getByText(copy.blockedLine)).toBeTruthy();
    fireEvent.press(screen.getByRole('button', { name: 'Open Settings' }));
    expect(onOpenSettings).toHaveBeenCalledTimes(1);
    fireEvent.press(screen.getByRole('button', { name: 'Add from your contacts' }));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('shows no Open Settings when the import is not blocked', () => {
    setup({ grouped: false, bringAcross: { onPress: jest.fn() } });
    expect(screen.queryByRole('button', { name: 'Open Settings' })).toBeNull();
  });

  it('a busy import button says it is reading, reads as busy, and ignores a second press', () => {
    const onPress = jest.fn();
    setup({ grouped: false, bringAcross: { onPress, busy: true } });
    const button = screen.getByRole('button', { name: 'Reading your contacts…' });
    expect(button.props.accessibilityState).toMatchObject({ busy: true });
    fireEvent.press(button);
    expect(onPress).not.toHaveBeenCalled();
  });

  it('with scrollList, the rows are not wrapped in a list', () => {
    setup({ grouped: false, scrollList: true });
    expect(screen.UNSAFE_queryAllByProps({ role: 'list' })).toHaveLength(0);
    expect(screen.UNSAFE_queryAllByProps({ role: 'listitem' })).toHaveLength(0);
    expect(screen.getAllByRole('checkbox')).toHaveLength(3);
  });

  it('without scrollList, the rows keep their list and listitem roles', () => {
    setup({ grouped: false });
    // Plain views with a role are not accessible elements, so they are found by prop.
    expect(screen.UNSAFE_getAllByProps({ role: 'list' }).length).toBeGreaterThan(0);
    expect(screen.UNSAFE_getAllByProps({ role: 'listitem' }).length).toBeGreaterThanOrEqual(3);
  });

  it('with scrollList, the count and Continue are still on the screen', () => {
    setup({ grouped: false, scrollList: true, selectedIds: ['a'] });
    expect(screen.getAllByRole('checkbox')).toHaveLength(3);
    expect(screen.getByRole('button', { name: 'Continue' })).toBeTruthy();
    expect(screen.getByText('1 selected')).toBeTruthy();
  });
});

describe('WhoShouldKnow add by hand (mobile, #652)', () => {
  const fill = () => {
    fireEvent.press(screen.getByRole('button', { name: 'Add another person' }));
    fireEvent.changeText(screen.getByLabelText('Name'), 'Dee');
    fireEvent.changeText(screen.getByLabelText('Mobile number'), '6175550148');
  };

  it('shows the calm error and keeps the typed text when saving fails', async () => {
    const onAddPerson = jest.fn(async () => {
      throw new Error('disk');
    });
    setup({ grouped: false, onAddPerson, guardedAdd: true });
    fill();
    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Add' }));
    });
    expect(screen.getByText('We could not save that. Please try again.')).toBeTruthy();
    expect(screen.getByLabelText('Name').props.value).toBe('Dee');
    expect(screen.getByLabelText('Mobile number').props.value).toBe('6175550148');
  });

  it('saves once on a double press', async () => {
    let finish: () => void = () => undefined;
    const onAddPerson = jest.fn(() => new Promise<void>((resolve) => { finish = resolve; }));
    setup({ grouped: false, onAddPerson, guardedAdd: true });
    fill();
    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Add' }));
    });
    fireEvent.press(screen.getByRole('button', { name: 'Saving…' }));
    expect(onAddPerson).toHaveBeenCalledTimes(1);
    await act(async () => {
      finish();
    });
    expect(screen.getByRole('button', { name: 'Add another person' })).toBeTruthy();
  });
});
