import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { AccessibilityInfo, AppState, Linking, Platform } from 'react-native';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react-native';
import type { Contact } from '@griever/shared';
import type { UseContactsResult } from '@griever/hooks';
import { Cancelled } from '@griever/contacts';
import { screenCopy } from '@griever/copy';
import { ContactSelectorScreen } from './ContactSelectorScreen';

// Jest has no native view tree, so findNodeHandle returns null. A fake handle lets the test see focus sent.
jest.mock('react-native/Libraries/ReactNative/RendererProxy', () => ({
  ...jest.requireActual<object>('react-native/Libraries/ReactNative/RendererProxy'),
  findNodeHandle: (node: unknown) => node ?? null,
}));

const mockFetch = jest.fn<() => Promise<unknown[]>>();
const mockAvailable = jest.fn<() => Promise<boolean>>();
const twoPeople = async () => [
  { key: 'x', displayName: 'Starred Sam', phones: ['+16175550111'], emails: [], starred: true },
  { key: 'y', displayName: 'Plain Pat', phones: ['+16175550112'], emails: [] },
];
jest.mock('../lib/expoContactsSource', () => ({
  expoContactsSource: {
    id: 'native',
    preselected: false,
    isAvailable: () => mockAvailable(),
    fetch: () => mockFetch(),
  },
}));

// The words inside a rendered node, to tell which button took focus.
const textOf = (node: unknown): string => {
  if (typeof node === 'string') {
    return node;
  }
  if (Array.isArray(node)) {
    return node.map(textOf).join('');
  }
  const props = (node as { props?: { children?: unknown } } | null)?.props;
  return props ? textOf(props.children) : '';
};

beforeEach(() => {
  mockFetch.mockReset().mockImplementation(twoPeople);
  mockAvailable.mockReset().mockResolvedValue(true);
});

const make = (id: string, name: string, tier: Contact['tier']): Contact => ({
  contactId: id,
  name,
  phone: `+1617555${id.padStart(4, '0')}`,
  email: null,
  tier,
  source: 'manual',
  createdAt: 0,
});

// The fixture mixes tiers, so the tests prove the saved order is kept.
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
  notified: Record<string, string[]> = {},
  contactsOver: Partial<UseContactsResult> = {},
) {
  const toggleContact = jest.fn();
  const selectContacts = jest.fn();
  const flow = {
    selectContacts,
    selectedContactIds,
    toggleContact,
    nextStep: jest.fn(),
    prevStep: jest.fn(),
    templateCategory,
  };
  const contacts = { contacts: contactList, loading: false, ...contactsOver } as unknown as UseContactsResult;
  const ui = (ids: string[]) => (
    <ContactSelectorScreen flow={{ ...flow, selectedContactIds: ids } as never} contacts={contacts} notified={notified} />
  );
  const { rerender } = render(ui(selectedContactIds));
  return { toggleContact, selectContacts, contacts, nextStep: flow.nextStep, prevStep: flow.prevStep, rerender: (ids: string[]) => rerender(ui(ids)) };
}

// The screen's own title is a heading too; the tier headings are the rest.
const headers = () =>
  screen
    .queryAllByRole('heading')
    .map((h) => h.props.children)
    .filter((text) => text !== 'Who should get this?');

describe('ContactSelectorScreen as a list to close (#672)', () => {
  it('reads "Who should get this?" and has no "What you\'ll need"', () => {
    renderScreen();
    expect(screen.getByRole('heading', { name: 'Who should get this?' })).toBeTruthy();
    expect(screen.queryByText("What you'll need")).toBeNull();
  });

  it('Close does what Back did, and there is no Back or Continue', () => {
    const { prevStep } = renderScreen();
    expect(screen.queryByRole('button', { name: 'Back' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Continue' })).toBeNull();
    fireEvent.press(screen.getByRole('button', { name: 'Close' }));
    expect(prevStep).toHaveBeenCalledTimes(1);
  });

  it('counts the people chosen in the Done label, and moves on', () => {
    const { nextStep } = renderScreen(saved, 'announcement', ['1', '2']);
    fireEvent.press(screen.getByRole('button', { name: 'Done · 2 chosen' }));
    expect(nextStep).toHaveBeenCalledTimes(1);
  });

  it('shows just "Done" when no one is chosen, and it still moves on', () => {
    const { nextStep } = renderScreen();
    fireEvent.press(screen.getByRole('button', { name: 'Done' }));
    expect(nextStep).toHaveBeenCalledTimes(1);
  });

  it('has no delete or swipe action on a row', () => {
    renderScreen();
    expect(screen.queryByRole('button', { name: /delete|remove/i })).toBeNull();
    // No long press and no swipe on a row or the list.
    for (const row of screen.getAllByRole('checkbox')) {
      expect(row.props.onLongPress).toBeUndefined();
    }
    expect(screen.UNSAFE_queryAllByProps({ onLongPress: expect.any(Function) })).toHaveLength(0);
    expect(screen.UNSAFE_queryAllByProps({ renderRightActions: expect.anything() })).toHaveLength(0);
    expect(screen.UNSAFE_queryAllByProps({ renderLeftActions: expect.anything() })).toHaveLength(0);
  });
});

describe('ContactSelectorScreen search', () => {
  const copy = screenCopy('whoShouldKnow');

  it('keeps a tick when the search hides the person, and the count stays right', () => {
    const { toggleContact, selectContacts } = renderScreen(saved, 'announcement', ['2']);
    fireEvent.changeText(screen.getByLabelText(copy.searchLabel), 'cat');
    expect(screen.queryByText('Mum')).toBeNull();
    expect(screen.getByText('Done · 1 chosen')).toBeTruthy();
    fireEvent.changeText(screen.getByLabelText(copy.searchLabel), '');
    expect(screen.getByText('Mum')).toBeTruthy();
    expect(toggleContact).not.toHaveBeenCalled();
    expect(selectContacts).not.toHaveBeenCalled();
    expect(screen.getByRole('checkbox', { name: /Mum/ }).props.accessibilityState.checked).toBe(true);
  });

  it('selects only the people shown, and says so when no one matches', () => {
    const { selectContacts } = renderScreen();
    fireEvent.changeText(screen.getByLabelText(copy.searchLabel), 'CAT');
    fireEvent.press(screen.getByRole('button', { name: copy.selectAllShown }));
    expect(selectContacts).toHaveBeenCalledWith(['3']);
    fireEvent.changeText(screen.getByLabelText(copy.searchLabel), 'zzz');
    expect(screen.getByText(copy.searchEmpty)).toBeTruthy();
    expect(screen.getByText(copy.searchEmpty).props.accessibilityLiveRegion).toBe('polite');
  });
});

describe('ContactSelectorScreen grouping', () => {
  it('for an announcement with mixed tiers, shows one list in saved order, with no tier headings', () => {
    renderScreen();
    expect(headers()).toEqual([]);
    expect(screen.queryByText('Close family')).toBeNull();
    expect(screen.queryByText('Friends & family')).toBeNull();
    const copy = screenCopy('whoShouldKnow');
    expect(screen.getByText(copy.introUngrouped)).toBeTruthy();
    expect(screen.queryByText(copy.introGrouped)).toBeNull();
    const rendered = screen.getAllByText(/^(Mum|Dad|Neighbour Ned|Cousin Cat)$/).map((n) => n.props.children);
    expect(rendered).toEqual(['Neighbour Ned', 'Mum', 'Cousin Cat', 'Dad']);
    // The one list has a single Select all, not one per tier.
    expect(screen.getAllByRole('button', { name: /^Select all/ })).toHaveLength(1);
  });

  it('shows a plain list in saved order, with no headings, for other templates', () => {
    renderScreen(saved, 'death');
    expect(headers()).toEqual([]);
    const rendered = screen.getAllByText(/^(Mum|Dad|Neighbour Ned|Cousin Cat)$/).map((n) => n.props.children);
    expect(rendered).toEqual(['Neighbour Ned', 'Mum', 'Cousin Cat', 'Dad']);
  });

  it('shows no headings when all contacts are family', () => {
    renderScreen([make('1', 'Neighbour Ned', 'family'), make('3', 'Cousin Cat', 'family')]);
    expect(headers()).toEqual([]);
    expect(screen.getByText('Neighbour Ned')).toBeTruthy();
  });

  it('preselects no one and sends nothing until the user picks', () => {
    const { toggleContact } = renderScreen();
    expect(screen.getByText('Done')).toBeTruthy();
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
    expect(await screen.findByRole('checkbox', { name: /Starred Sam/, checked: false })).toBeTruthy();
    expect(screen.getByText('Choose only the ones you want — the rest stay where they are.')).toBeTruthy();
    const plain = screen.getByRole('checkbox', { name: /Plain Pat/, checked: false });
    fireEvent.press(plain);
    expect(screen.getByRole('checkbox', { name: /Plain Pat/, checked: true })).toBeTruthy();
    const ticks = screen.getAllByText('✓', { includeHiddenElements: true });
    expect(ticks).toHaveLength(1);
    ticks.forEach((t) => expect(t.props.accessibilityElementsHidden).toBe(true));
  });

  it('titles the import review "Add from your contacts" and Back returns to the list', async () => {
    renderScreen();
    fireEvent.press(screen.getByRole('button', { name: 'Add from your contacts' }));
    expect(await screen.findByRole('heading', { name: 'Add from your contacts' })).toBeTruthy();
    fireEvent.press(screen.getByRole('button', { name: 'Back' }));
    expect(await screen.findByText('Who should get this?')).toBeTruthy();
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
    await screen.findByText('Who should get this?');
    expect(focus).toHaveBeenCalledTimes(1);
  });

  it('shows why Add is unavailable in the review until someone is chosen', async () => {
    renderScreen();
    fireEvent.press(screen.getByRole('button', { name: 'Add from your contacts' }));
    await screen.findByRole('heading', { name: 'Add from your contacts' });
    expect(screen.getByText('Choose at least one person', { includeHiddenElements: true })).toBeTruthy();
    fireEvent.press(await screen.findByRole('checkbox', { name: /Starred Sam/, checked: false }));
    fireEvent.press(screen.getByRole('checkbox', { name: /Starred Sam/, checked: true }));
    expect(screen.getByRole('button', { name: 'Add' }).props.accessibilityHint).toBe('Choose at least one person');
  });

  it('keeps Done available with no one chosen, with no reason line', () => {
    renderScreen();
    const done = screen.getByRole('button', { name: 'Done' });
    expect(done.props.accessibilityState).not.toEqual(expect.objectContaining({ disabled: true }));
    expect(screen.queryByText('Choose at least one person', { includeHiddenElements: true })).toBeNull();
  });

  it.each(['ios', 'android'] as const)('announces the new count on %s when the selection changes, and not on first render', (os) => {
    const original = Platform.OS;
    Platform.OS = os;
    try {
      const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => undefined);
      announce.mockClear();
      const { rerender } = renderScreen();
      expect(announce).not.toHaveBeenCalledWith('Done');
      expect(announce).not.toHaveBeenCalledWith('Done · 1 chosen');
      rerender(['2']);
      expect(announce).toHaveBeenLastCalledWith('Done · 1 chosen');
      rerender([]);
      expect(announce).toHaveBeenLastCalledWith('Done');
      expect(announce.mock.calls.filter(([text]) => String(text).startsWith('Done'))).toHaveLength(2);
    } finally {
      Platform.OS = original;
    }
  });
});

describe('ContactSelectorScreen with no one picked', () => {
  it.each(['service', 'obituary'])('lets Done work on %s', (category) => {
    renderScreen(saved, category);
    const cont = screen.getByRole('button', { name: /^Done/ });
    expect(cont.props.accessibilityState).not.toEqual(expect.objectContaining({ disabled: true }));
    expect(screen.queryByText('Choose at least one person', { includeHiddenElements: true })).toBeNull();
  });

  it.each(['service', 'obituary'])('calls nextStep on %s with zero people', (category) => {
    const { nextStep } = renderScreen(saved, category);
    fireEvent.press(screen.getByRole('button', { name: /^Done/ }));
    expect(nextStep).toHaveBeenCalledTimes(1);
  });

  it.each(['service', 'obituary'])('shows one muted line on %s while no one is ticked', (category) => {
    renderScreen(saved, category);
    expect(screen.getAllByText('No one picked? You can share it to a group or by email next.')).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Done' }).props.accessibilityHint).toBe(
      'No one picked? You can share it to a group or by email next.',
    );
  });

  it('drops the line once someone is ticked', () => {
    renderScreen(saved, 'service', ['1']);
    expect(screen.queryByText(/No one picked/)).toBeNull();
  });

  it.each(['announcement', 'aftercare'])('does not show the line on %s', (category) => {
    renderScreen(saved, category);
    expect(screen.queryByText(/No one picked/, { includeHiddenElements: true })).toBeNull();
  });

  it.each(['announcement', 'aftercare'])('still moves on from Done on %s with no one chosen', (category) => {
    const { nextStep } = renderScreen(saved, category);
    fireEvent.press(screen.getByRole('button', { name: 'Done' }));
    expect(nextStep).toHaveBeenCalledTimes(1);
  });
});

describe('ContactSelectorScreen shortcuts', () => {
  // The merge (never unticking) is covered in useSendFlow.spec.ts.
  const copy = screenCopy('whoShouldKnow');

  it('Everyone you told ticks the saved announcement recipients on the service picker', () => {
    const { selectContacts } = renderScreen(saved, 'service', [], { announcement: ['2', '4'] });
    fireEvent.press(screen.getByRole('button', { name: copy.everyoneYouToldSelectAll }));
    expect(selectContacts).toHaveBeenCalledWith(['2', '4']);
    expect(screen.queryByRole('button', { name: copy.notSentYetSelectAll })).toBeNull();
  });

  it('ignores a deleted contact', () => {
    const { selectContacts } = renderScreen(saved, 'obituary', [], { announcement: ['2', '99'] });
    fireEvent.press(screen.getByRole('button', { name: copy.everyoneYouToldSelectAll }));
    expect(selectContacts).toHaveBeenCalledWith(['2']);
  });

  it('gives the announcement picker Not sent yet only, never Everyone you told', () => {
    const { selectContacts } = renderScreen(saved, 'announcement', [], { announcement: ['2'] });
    expect(screen.queryByRole('button', { name: copy.everyoneYouToldSelectAll })).toBeNull();
    fireEvent.press(screen.getByRole('button', { name: copy.notSentYetSelectAll }));
    expect(selectContacts).toHaveBeenCalledWith(['1', '3', '4']);
  });

  it('shows no shortcut on the announcement picker before anyone was told', () => {
    renderScreen(saved, 'announcement', [], {});
    expect(screen.queryByRole('button', { name: copy.notSentYetSelectAll })).toBeNull();
  });

  it('starts each shortcut name with its visible label', () => {
    renderScreen(saved, 'service', [], { announcement: ['2'], service: ['2'] });
    expect(copy.everyoneYouToldSelectAll.startsWith(copy.everyoneYouTold)).toBe(true);
    expect(copy.notSentYetSelectAll.startsWith(copy.notSentYet)).toBe(true);
    expect(screen.getByRole('button', { name: copy.everyoneYouToldSelectAll })).toBeTruthy();
    expect(screen.getByRole('button', { name: copy.notSentYetSelectAll })).toBeTruthy();
  });

  it('shows no Everyone you told when the announcement list is empty', () => {
    renderScreen(saved, 'aftercare', [], {});
    expect(screen.queryByRole('button', { name: copy.everyoneYouToldSelectAll })).toBeNull();
  });

  it('Not sent yet ticks the saved contacts this moment has not reached', () => {
    const { selectContacts } = renderScreen(saved, 'service', [], { announcement: ['2'], service: ['2', '4'] });
    fireEvent.press(screen.getByRole('button', { name: copy.notSentYetSelectAll }));
    expect(selectContacts).toHaveBeenCalledWith(['1', '3']);
  });

  it('shows no Not sent yet when this moment has reached every saved contact', () => {
    renderScreen(saved, 'service', [], { announcement: ['2'], service: ['1', '2', '3', '4'] });
    expect(screen.queryByRole('button', { name: copy.notSentYetSelectAll })).toBeNull();
  });
});

describe('ContactSelectorScreen contacts never fail silently (#652)', () => {
  const copy = screenCopy('whoShouldKnow');
  const openImport = () => fireEvent.press(screen.getByRole('button', { name: copy.bringAcross }));

  it('refused for good: shows the calm line and Open Settings, and the button opens Settings', async () => {
    mockFetch.mockRejectedValue(new Cancelled('blocked'));
    const openSettings = jest.spyOn(Linking, 'openSettings').mockResolvedValue(undefined);
    renderScreen();
    openImport();
    expect(await screen.findByText(copy.blockedLine)).toBeTruthy();
    // The import button stays, so a press can ask again.
    expect(screen.getByRole('button', { name: copy.bringAcross })).toBeTruthy();
    fireEvent.press(screen.getByRole('button', { name: copy.openSettings }));
    expect(openSettings).toHaveBeenCalledTimes(1);
  });

  it('refused for good: moves focus to the line itself, not Open Settings, and does not announce it separately', async () => {
    mockFetch.mockRejectedValue(new Cancelled('blocked'));
    const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => undefined);
    const focus = jest.spyOn(AccessibilityInfo, 'setAccessibilityFocus').mockImplementation(() => undefined);
    renderScreen();
    focus.mockClear();
    openImport();
    await screen.findByText(copy.blockedLine);
    // The line is read by the focus move. A separate announcement would be cut off by it on iOS.
    expect(announce).not.toHaveBeenCalledWith(copy.blockedLine);
    expect(focus).toHaveBeenCalledTimes(1);
    // Focus went to the line (a text), and Open Settings is the next swipe.
    const target = focus.mock.calls[0]?.[0] as unknown as { props: { role?: string; children: unknown } };
    expect(target.props.role).not.toBe('button');
    expect(textOf(target.props.children)).toBe(copy.blockedLine);
  });

  it('pressing the import button again after a refusal asks again and goes on if allowed', async () => {
    mockFetch.mockRejectedValueOnce(new Cancelled('blocked'));
    renderScreen();
    openImport();
    await screen.findByText(copy.blockedLine);
    fireEvent.press(screen.getByRole('button', { name: copy.bringAcross }));
    expect(await screen.findByRole('heading', { name: copy.bringAcross })).toBeTruthy();
    expect(screen.queryByText(copy.blockedLine)).toBeNull();
  });

  it('coming back from Settings with contacts allowed clears the line and focuses the import button', async () => {
    mockFetch.mockRejectedValue(new Cancelled('blocked'));
    let onChange: (state: string) => void = () => undefined;
    jest.spyOn(AppState, 'addEventListener').mockImplementation(((_: string, cb: (state: string) => void) => {
      onChange = cb;
      return { remove: () => undefined };
    }) as never);
    const focus = jest.spyOn(AccessibilityInfo, 'setAccessibilityFocus').mockImplementation(() => undefined);
    renderScreen();
    openImport();
    await screen.findByText(copy.blockedLine);
    // Still refused: nothing changes.
    mockAvailable.mockResolvedValue(false);
    await act(async () => {
      onChange('active');
    });
    expect(screen.getByText(copy.blockedLine)).toBeTruthy();
    mockAvailable.mockResolvedValue(true);
    focus.mockClear();
    await act(async () => {
      onChange('active');
    });
    await waitFor(() => expect(screen.queryByText(copy.blockedLine)).toBeNull());
    expect(screen.queryByRole('button', { name: copy.openSettings })).toBeNull();
    expect(screen.getByRole('button', { name: copy.bringAcross })).toBeTruthy();
    expect(focus).toHaveBeenCalledTimes(1);
    expect(textOf((focus.mock.calls[0]?.[0] as unknown as { props: { children: unknown } }).props.children)).toBe(copy.bringAcross);
  });

  it('a plain no, or a refusal the system can ask about again, shows nothing', async () => {
    mockFetch.mockRejectedValue(new Cancelled('denied'));
    renderScreen();
    openImport();
    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByRole('button', { name: copy.bringAcross })).toBeTruthy());
    expect(screen.queryByText(copy.blockedLine)).toBeNull();
    expect(screen.queryByRole('button', { name: copy.openSettings })).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('shows a busy spinner and "Reading your contacts…" while the read runs, and ignores a second tap', async () => {
    let finish: (value: unknown[]) => void = () => undefined;
    mockFetch.mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
    renderScreen();
    openImport();
    const busy = await screen.findByRole('button', { name: copy.bringAcrossBusy });
    expect(busy.props.accessibilityState).toEqual(expect.objectContaining({ busy: true }));
    expect(screen.UNSAFE_queryByType(require('react-native').ActivityIndicator)).toBeTruthy();
    fireEvent.press(busy);
    expect(mockFetch).toHaveBeenCalledTimes(1);
    await act(async () => {
      finish([]);
    });
  });

  it('brings people in unticked, then ticks the ones added', async () => {
    const importContacts = jest.fn(async () => [{ ...make('9', 'Plain Pat', 'family') }]);
    const { selectContacts } = renderScreen(saved, 'announcement', [], {}, { importContacts } as never);
    openImport();
    expect(await screen.findByRole('checkbox', { name: /Starred Sam/, checked: false })).toBeTruthy();
    fireEvent.press(screen.getByRole('checkbox', { name: /Plain Pat/ }));
    fireEvent.press(screen.getByRole('button', { name: 'Add' }));
    await waitFor(() => expect(selectContacts).toHaveBeenCalledWith(['9']));
    expect(importContacts).toHaveBeenCalledTimes(1);
    expect(await screen.findByText('Who should get this?')).toBeTruthy();
  });

  it('searches the review by name', async () => {
    renderScreen();
    openImport();
    await screen.findByText('Starred Sam');
    fireEvent.changeText(screen.getByLabelText(copy.searchLabel), 'pat');
    expect(screen.queryByText('Starred Sam')).toBeNull();
    expect(screen.getByText('Plain Pat')).toBeTruthy();
    fireEvent.changeText(screen.getByLabelText(copy.searchLabel), 'zzz');
    expect(screen.getByText(copy.searchEmpty)).toBeTruthy();
    expect(screen.getByText(copy.searchEmpty).props.accessibilityLiveRegion).toBe('polite');
  });

  it('a double tap on Add saves once, and Add reads as saving', async () => {
    let finish: (value: unknown[]) => void = () => undefined;
    const importContacts = jest
      .fn<() => Promise<unknown[]>>()
      .mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    renderScreen(saved, 'announcement', [], {}, { importContacts } as never);
    openImport();
    fireEvent.press(await screen.findByRole('checkbox', { name: /Plain Pat/ }));
    const add = screen.getByRole('button', { name: 'Add' });
    fireEvent.press(add);
    fireEvent.press(add);
    expect(importContacts).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: copy.saving })).toBeTruthy();
    await act(async () => {
      finish([]);
    });
  });

  it('a failed save shows the error and keeps the ticks', async () => {
    const importContacts = jest.fn(async () => {
      throw new Error('disk');
    });
    const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => undefined);
    renderScreen(saved, 'announcement', [], {}, { importContacts } as never);
    openImport();
    fireEvent.press(await screen.findByRole('checkbox', { name: /Plain Pat/ }));
    fireEvent.press(screen.getByRole('button', { name: 'Add' }));
    expect(await screen.findByText(copy.saveFailed)).toBeTruthy();
    expect(announce).toHaveBeenCalledWith(copy.saveFailed);
    expect(screen.getByRole('alert')).toBeTruthy();
    expect(screen.getByRole('checkbox', { name: /Plain Pat/, checked: true })).toBeTruthy();
    expect(screen.getByText('1 chosen')).toBeTruthy();
  });
});

describe('ContactSelectorScreen people list (#652)', () => {
  const copy = screenCopy('whoShouldKnow');

  it('tags rows already sent this moment as Sent, and no others, in the row name', () => {
    renderScreen(saved, 'service', [], { service: ['2'], announcement: ['2'] });
    expect(copy.sent).toBe('Sent');
    expect(screen.getAllByText(copy.sent)).toHaveLength(1);
    // The tag sits inside the same checkbox as the name, so it is read with it (RNTL matches name per child text).
    expect(within(screen.getByRole('checkbox', { name: /Mum/ })).getByText(copy.sent)).toBeTruthy();
    expect(within(screen.getByRole('checkbox', { name: /Dad/ })).queryByText(copy.sent)).toBeNull();
  });

  it('shows no Sent tag when no one was sent', () => {
    renderScreen(saved, 'service');
    expect(screen.queryByText(copy.sent)).toBeNull();
  });

  it('names the shortcuts with "select all"', () => {
    renderScreen(saved, 'service', [], { announcement: ['2'], service: ['2'] });
    expect(screen.getByRole('button', { name: 'Everyone you told: select all' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Not sent yet: select all' })).toBeTruthy();
  });

  it('reads the loading line out politely', () => {
    renderScreen([], 'announcement', [], {}, { loading: true });
    expect(screen.getByText(copy.loadingPeople).props.accessibilityLiveRegion).toBe('polite');
  });

  it('shows a muted loading line while the saved people load', () => {
    renderScreen([], 'announcement', [], {}, { loading: true });
    expect(screen.getByText(copy.loadingPeople)).toBeTruthy();
    expect(screen.queryByText(copy.empty)).toBeNull();
  });

  it('keeps Done outside the list, and renders the list as a FlatList', () => {
    renderScreen();
    const { FlatList } = require('react-native');
    expect(screen.UNSAFE_queryAllByType(FlatList)).toHaveLength(1);
    const list = screen.UNSAFE_getByType(FlatList);
    expect(() => within(list).getByRole('button', { name: /^Done/ })).toThrow();
    expect(screen.getByRole('button', { name: /^Done/ })).toBeTruthy();
  });

  it('copes with a big address book', () => {
    const many = Array.from({ length: 300 }, (_, i) => make(String(i + 1), `Person ${i + 1}`, 'family'));
    renderScreen(many);
    expect(screen.getByText('Person 1')).toBeTruthy();
    expect(screen.getByRole('button', { name: /^Done/ })).toBeTruthy();
  });
});
