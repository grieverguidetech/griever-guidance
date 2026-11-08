import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { AccessibilityInfo, BackHandler, Modal, Platform, ScrollView, StyleSheet } from 'react-native';
import { act, fireEvent, render, screen, within } from '@testing-library/react-native';
import type { Session } from '@griever/hooks';
import { freshDraft } from '@griever/hooks';
import { screenCopy } from '@griever/copy';
import { CHECKLIST_PHASES, templates } from '@griever/shared';
import { colors } from '@griever/tokens';
import { Path } from 'react-native-svg';
import { SerifReadyContext } from '../ui';
import { HubScreen } from './HubScreen';
import type { HubScreenProps } from './HubScreen';

// Jest has no native view tree, so findNodeHandle returns null. A fake handle lets the test see focus sent.
// This path is specific to this react-native version. Re-check it when react-native is upgraded.
jest.mock('react-native/Libraries/ReactNative/RendererProxy', () => ({
  ...jest.requireActual<object>('react-native/Libraries/ReactNative/RendererProxy'),
  // A distinct handle per node, so a test can tell which node got screen-reader focus.
  findNodeHandle: (node: unknown) => {
    const g = globalThis as unknown as { nodeHandles?: Map<unknown, number> };
    g.nodeHandles ??= new Map();
    if (!g.nodeHandles.has(node)) {
      g.nodeHandles.set(node, g.nodeHandles.size + 1);
    }
    return g.nodeHandles.get(node);
  },
}));

// WCAG relative luminance and contrast ratio, to check text and the check mark on the card colour.
function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const v = parseInt(hex.slice(i, i + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * (r as number) + 0.7152 * (g as number) + 0.0722 * (b as number);
}
function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return ((hi as number) + 0.05) / ((lo as number) + 0.05);
}

// The first item of the first phase, a real id so the saved tick is read back.
const firstItem = CHECKLIST_PHASES.find((phase) => phase.key === 'right-away')?.itemIds[0] as string;

const rightAwayIds = (CHECKLIST_PHASES.find((phase) => phase.key === 'right-away')?.itemIds ?? []);

const anna = {
  id: 'a',
  flowId: 'flow-a',
  ownerId: null,
  role: 'owner',
  personName: 'Anna',
  dateOfPassing: '',
  senderName: '',
  obituaryUrl: '',
  createdAt: '2026-10-01T00:00:00.000Z',
  lastOpenedAt: '2026-10-01T00:00:00.000Z',
  drafts: {},
  serviceReady: false,
  recipientsNotified: {},
  momentCompletedAt: {},
  remindersScheduled: [],
} as unknown as Session;

function setup(session: Session = anna, paymentsEnabled = false, extra: Partial<HubScreenProps> = {}) {
  const handlers = { others: [] as Session[], onSwitch: jest.fn(), onStart: jest.fn(), onSetItem: jest.fn(), onEditPerson: jest.fn() };
  render(<HubScreen session={session} paymentsEnabled={paymentsEnabled} {...handlers} {...extra} />);
  return handlers;
}

// Each sheet's Modal is found by its test id, never by its place in the tree. A closed Modal draws nothing, so this looks at the React elements, not the drawn nodes.
const modalById = (testID: string) => {
  const modal = screen.UNSAFE_getAllByType(Modal).find((m) => m.props.testID === testID);
  if (!modal) {
    throw new Error(`No Modal with testID ${testID}`);
  }
  return modal;
};
const switcherModal = () => modalById('switcher-sheet');
const checklistModal = () => modalById('checklist-sheet');
const paywallModal = () => modalById('paywall-sheet');
const checklistButton = () => screen.getByRole('button', { name: "What you'll need" });

// The handle the fake findNodeHandle gave the node that was focused last.
const handleOf = (predicate: (node: any) => boolean) => {
  const handles = (globalThis as unknown as { nodeHandles: Map<unknown, number> }).nodeHandles;
  return [...handles].find(([node]) => predicate(node))?.[1];
};

// The handle the fake gave the What you'll need button (found by its hint), so a test sees focus go to it and nowhere else.
const checklistHandle = () => handleOf((node) => node?.props?.accessibilityHint === 'Opens a checklist of things to do.') ?? -1;

// The node that got the last screen-reader focus call.
const focusedNode = (focus: jest.SpiedFunction<typeof AccessibilityInfo.setAccessibilityFocus>) => {
  const handle = focus.mock.calls.at(-1)?.[0];
  const handles = (globalThis as unknown as { nodeHandles: Map<any, number> }).nodeHandles;
  return [...handles].find(([, h]) => h === handle)?.[0];
};

// The button in the bottom bar, found by the bar's test id.
const bottomButton = () => within(screen.getByTestId('hub-action-bar')).getByRole('button');

describe('HubScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (globalThis as unknown as { nodeHandles?: Map<unknown, number> }).nodeHandles?.clear();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('shows the person, the heading and the four steps, with the bottom button naming the announcement', () => {
    setup();
    expect(screen.getByRole('heading', { name: 'Ready to send' })).toBeTruthy();
    expect(screen.getByText("Send when you're ready.")).toBeTruthy();
    expect(screen.queryByText(/Planned on the web/)).toBeNull();
    expect(screen.getByText('For Anna')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Start' })).toBeNull();
    expect(within(bottomButton()).getByText('Announce the passing')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Share the service/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Send thank-yous/ })).toBeTruthy();
  });

  it('starts the obituary from its row, with no "Not in the app yet"', () => {
    const { onStart } = setup();
    expect(screen.queryByText(/Not in the app yet/)).toBeNull();
    fireEvent.press(screen.getByRole('button', { name: /Share the obituary/ }));
    expect(onStart).toHaveBeenLastCalledWith('obituary');
  });

  it('moves screen-reader focus to the heading when it opens', () => {
    const focus = jest.spyOn(AccessibilityInfo, 'setAccessibilityFocus').mockImplementation(() => undefined);
    setup();
    expect(focus).toHaveBeenCalledWith(1);
  });

  it('starts the announcement from the bottom button, and a later step from its row', () => {
    const { onStart } = setup();
    fireEvent.press(bottomButton());
    expect(onStart).toHaveBeenLastCalledWith('announce');
    fireEvent.press(screen.getByRole('button', { name: /Send thank-yous/ }));
    expect(onStart).toHaveBeenLastCalledWith('thanks');
  });

  it('has no Home button, and no delete or remove anywhere on the screen', () => {
    setup();
    expect(screen.queryByRole('button', { name: 'Home' })).toBeNull();
    expect(screen.queryByRole('button', { name: /delete|remove/i })).toBeNull();
  });

  it('shows the name top-left as a button with the label, even while it is the only person', () => {
    setup();
    expect(screen.getByRole('button', { name: 'Writing about Anna' })).toBeTruthy();
  });

  it('with one person, the name opens the switcher with Edit person, which runs onEditPerson once the sheet is gone', () => {
    const { onEditPerson } = setup();
    fireEvent.press(screen.getByRole('button', { name: 'Writing about Anna' }));
    fireEvent.press(screen.getByRole('button', { name: 'Edit person' }));
    expect(onEditPerson).not.toHaveBeenCalled();
    act(() => switcherModal().props.onDismiss());
    expect(onEditPerson).toHaveBeenCalledTimes(1);
  });

  it('shows the name as a button with 2 or more people, and picking another person calls onSwitch', () => {
    const ben = { ...anna, id: 'b', personName: 'Ben' } as Session;
    const { onSwitch } = setup(anna, false, { others: [ben] });
    fireEvent.press(screen.getByRole('button', { name: 'Writing about Anna' }));
    fireEvent.press(screen.getByRole('button', { name: 'Ben' }));
    // The switcher sheet is the first Modal; it runs the choice once it is gone.
    act(() => switcherModal().props.onDismiss());
    expect(onSwitch).toHaveBeenCalledWith('b');
  });

  it('puts Add someone in the switcher when this is the only person, and runs it once the sheet is gone', () => {
    const onAddSomeone = jest.fn();
    setup(anna, false, { onAddSomeone });
    fireEvent.press(screen.getByRole('button', { name: 'Writing about Anna' }));
    fireEvent.press(within(screen.getByTestId('switcher-sheet')).getByRole('button', { name: 'Add someone' }));
    act(() => switcherModal().props.onDismiss());
    expect(onAddSomeone).toHaveBeenCalledTimes(1);
  });

  it('draws no Add someone anywhere when the user cannot create a person (C11)', () => {
    const ben = { ...anna, id: 'b', personName: 'Ben' } as Session;
    setup(anna, false, { others: [ben] });
    fireEvent.press(screen.getByRole('button', { name: 'Writing about Anna' }));
    expect(screen.queryByRole('button', { name: 'Add someone' })).toBeNull();
  });

  it('has a What you will need button on the top bar and no More, no Add from your contacts, no Edit person on the screen itself', () => {
    setup();
    expect(checklistButton()).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'More' })).toBeNull();
    expect(screen.queryByText('More')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Add from your contacts' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Edit person' })).toBeNull();
  });

  it('draws What you will need as the quiet text-only button: no outline, no background', () => {
    setup();
    const flat = StyleSheet.flatten(typeof checklistButton().props.style === 'function' ? checklistButton().props.style({ pressed: false }) : checklistButton().props.style);
    expect(flat.backgroundColor).toBeUndefined();
    expect(flat.borderColor).toBe('transparent');
  });

  it('gives the button a hint on native', () => {
    setup();
    expect(checklistButton().props.accessibilityHint).toBe('Opens a checklist of things to do.');
  });

  it('opens the checklist sheet only after a tap on What you will need', () => {
    setup();
    expect(checklistModal().props.visible).toBe(false);
    fireEvent.press(checklistButton());
    expect(checklistModal().props.visible).toBe(true);
    expect(within(screen.getByTestId('checklist-sheet')).getByRole('heading', { name: "What you'll need" })).toBeTruthy();
    expect(within(screen.getByTestId('checklist-sheet')).getByText('Your ticks stay on this phone.')).toBeTruthy();
  });

  it('passes the open person\'s checklist to the sheet and saves a tick through onSetItem', () => {
    const onSetItem = jest.fn();
    setup({ ...anna, checklist: { [firstItem]: 'done' } } as unknown as Session, false, { onSetItem });
    fireEvent.press(checklistButton());
    // The first phase is not done by this one tick, so it shows no Done; opening it shows the saved tick.
    fireEvent.press(within(screen.getByTestId('checklist-sheet')).getByRole('button', { name: /^Right away/ }));
    const rows = within(screen.getByTestId('checklist-sheet')).getAllByRole('checkbox');
    expect(rows.some((row) => row.props.accessibilityState.checked === true)).toBe(true);
    const open = rows.find((row) => row.props.accessibilityState.checked === false);
    fireEvent.press(open as NonNullable<typeof open>);
    expect(onSetItem).toHaveBeenCalledTimes(1);
    expect(onSetItem.mock.calls[0][0]).toBe(rightAwayIds[1]);
    expect(onSetItem.mock.calls[0][1]).toBe('done');
  });

  it('shows the Your account link at the foot only when accounts are on, and it runs onAccount', () => {
    const { rerender } = render(<HubScreen session={anna} paymentsEnabled={false} others={[]} onSwitch={jest.fn()} onStart={jest.fn()} onSetItem={jest.fn()} onEditPerson={jest.fn()} />);
    expect(screen.queryByRole('button', { name: 'Your account' })).toBeNull();
    const onAccount = jest.fn();
    rerender(<HubScreen session={anna} paymentsEnabled={false} others={[]} onSwitch={jest.fn()} onStart={jest.fn()} onSetItem={jest.fn()} onEditPerson={jest.fn()} onAccount={onAccount} />);
    fireEvent.press(screen.getByRole('button', { name: 'Your account' }));
    expect(onAccount).toHaveBeenCalledTimes(1);
  });

  it('puts the Your account link after the last step, as plain text with no outline', () => {
    setup(anna, false, { onAccount: jest.fn() });
    const tree = JSON.stringify(screen.toJSON());
    expect(tree.indexOf('Send thank-yous')).toBeLessThan(tree.indexOf('Your account'));
    const link = screen.getByRole('button', { name: 'Your account' });
    const flat = StyleSheet.flatten(typeof link.props.style === 'function' ? link.props.style({ pressed: false }) : link.props.style);
    expect(flat.backgroundColor).toBeUndefined();
    expect(flat.borderColor).toBe('transparent');
  });

  it('after the checklist sheet closes on iOS, screen-reader focus goes back to What you will need (onDismiss)', () => {
    const focus = jest.spyOn(AccessibilityInfo, 'setAccessibilityFocus').mockImplementation(() => undefined);
    const original = Platform.OS;
    Platform.OS = 'ios';
    try {
      setup();
      fireEvent.press(checklistButton());
      focus.mockClear();
      fireEvent.press(within(screen.getByTestId('checklist-sheet')).getByRole('button', { name: 'Close' }));
      expect(checklistModal().props.visible).toBe(false);
      // iOS tells us when the sheet is gone; nothing is sent before that.
      expect(focus).not.toHaveBeenCalled();
      act(() => checklistModal().props.onDismiss());
      expect(focus).toHaveBeenCalledWith(checklistHandle());
      expect(checklistHandle()).toBeDefined();
    } finally {
      Platform.OS = original;
    }
  });

  it('on Android, closing the checklist sheet sends focus back to What you will need without onDismiss', () => {
    jest.useFakeTimers();
    const original = Platform.OS;
    Platform.OS = 'android';
    try {
      const focus = jest.spyOn(AccessibilityInfo, 'setAccessibilityFocus').mockImplementation(() => undefined);
      setup();
      fireEvent.press(checklistButton());
      focus.mockClear();
      fireEvent.press(within(screen.getByTestId('checklist-sheet')).getByRole('button', { name: 'Close' }));
      act(() => {
        jest.runAllTimers();
      });
      expect(focus).toHaveBeenCalledWith(checklistHandle());
      expect(checklistHandle()).toBeDefined();
    } finally {
      Platform.OS = original;
      jest.useRealTimers();
    }
  });

  it('on Android, leaving the screen before the focus timer runs cancels it', () => {
    jest.useFakeTimers();
    const original = Platform.OS;
    Platform.OS = 'android';
    try {
      const focus = jest.spyOn(AccessibilityInfo, 'setAccessibilityFocus').mockImplementation(() => undefined);
      const view = render(<HubScreen session={anna} paymentsEnabled={false} others={[]} onSwitch={jest.fn()} onStart={jest.fn()} onSetItem={jest.fn()} onEditPerson={jest.fn()} />);
      fireEvent.press(checklistButton());
      focus.mockClear();
      fireEvent.press(within(screen.getByTestId('checklist-sheet')).getByRole('button', { name: 'Close' }));
      view.unmount();
      act(() => {
        jest.runAllTimers();
      });
      expect(focus).not.toHaveBeenCalled();
    } finally {
      Platform.OS = original;
      jest.useRealTimers();
    }
  });

  it('on Android, the Back gesture on the checklist sheet closes it and returns focus to the button', () => {
    jest.useFakeTimers();
    const original = Platform.OS;
    Platform.OS = 'android';
    try {
      const focus = jest.spyOn(AccessibilityInfo, 'setAccessibilityFocus').mockImplementation(() => undefined);
      setup();
      fireEvent.press(checklistButton());
      focus.mockClear();
      act(() => checklistModal().props.onRequestClose());
      expect(checklistModal().props.visible).toBe(false);
      act(() => {
        jest.runAllTimers();
      });
      expect(focus).toHaveBeenCalledWith(checklistHandle());
    } finally {
      Platform.OS = original;
      jest.useRealTimers();
    }
  });

  it('shows the sent note as a polite live region, and announces it on iOS', () => {
    const original = Platform.OS;
    Platform.OS = 'ios';
    const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibilityWithOptions').mockImplementation(() => undefined);
    const note = { lead: 'Everyone has been told.', rest: 'Kept private.', spoken: 'Everyone has been told. Kept private.', category: 'announcement' as const, partial: false };
    render(<HubScreen session={anna} paymentsEnabled={false} others={[]} onSwitch={jest.fn()} onStart={jest.fn()} onSetItem={jest.fn()} onEditPerson={jest.fn()} note={note} />);
    Platform.OS = original;
    expect(screen.getByText('Everyone has been told.')).toBeTruthy();
    expect(screen.getByLabelText('Everyone has been told. Kept private.').props.accessibilityLiveRegion).toBe('polite');
    expect(announce).toHaveBeenCalledWith(note.spoken, { queue: true });
    expect(announce).toHaveBeenCalledTimes(1);
  });

  it('announces the note on Android after a short wait, once', () => {
    jest.useFakeTimers();
    const original = Platform.OS;
    Platform.OS = 'android';
    const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => undefined);
    const note = { lead: 'Everyone has been told.', rest: 'Kept private.', spoken: 'Everyone has been told. Kept private.', category: 'announcement' as const, partial: false };
    render(<HubScreen session={anna} paymentsEnabled={false} others={[]} onSwitch={jest.fn()} onStart={jest.fn()} onSetItem={jest.fn()} onEditPerson={jest.fn()} note={note} />);
    Platform.OS = original;
    expect(announce).not.toHaveBeenCalled();
    act(() => {
      jest.advanceTimersByTime(150);
    });
    expect(announce).toHaveBeenCalledWith(note.spoken);
    expect(announce).toHaveBeenCalledTimes(1);
    jest.useRealTimers();
  });

  it('shows a finished step with a check and the word Sent, and a started step with In progress and no icon', () => {
    const done = {
      ...anna,
      recipientsNotified: { announcement: ['c1', 'c2'] },
      momentCompletedAt: { announce: '2026-10-02T12:00:00.000Z' },
      drafts: { service: freshDraft({ templateCategory: 'service', step: 'details', fields: { serviceLocation: 'St Mary' } }) },
    } as unknown as Session;
    setup(done);
    expect(screen.getByRole('button', { name: 'Announce the passing, Sent to 2 people, Sent' })).toBeTruthy();
    expect(screen.queryByText(/October 2, 2026|Send again|Sent to 0|Started/)).toBeNull();
    const service = screen.getByRole('button', { name: /^Share the service.*In progress$/ });
    expect(within(service).getByText('In progress')).toBeTruthy();
    expect(within(service).queryByTestId('status-check', { includeHiddenElements: true })).toBeNull();
  });

  it('shows the check only beside Sent, and no progress or circle icon anywhere', () => {
    const mixed = {
      ...anna,
      recipientsNotified: { announcement: ['c1'] },
      momentCompletedAt: { announce: '2026-10-02T12:00:00.000Z' },
      drafts: { service: freshDraft({ templateCategory: 'service', step: 'details', fields: { serviceLocation: 'St Mary' } }) },
      obituaryText: 'Anna loved the garden.',
    } as unknown as Session;
    setup(mixed);
    const check = (name: RegExp | string) => within(screen.getByRole('button', { name })).queryByTestId('status-check', { includeHiddenElements: true });
    expect(check('Announce the passing, Sent to 1 person, Sent')).toBeTruthy();
    expect(check(/^Share the service.*, In progress(, Continue)?$/)).toBeNull();
    expect(check(/Share the obituary.*, In progress(, Continue)?$/)).toBeNull();
    expect(check(/^Send thank-yous.*, Not started$/)).toBeNull();
    // The word is drawn on every card.
    expect(within(screen.getByRole('button', { name: /^Send thank-yous/ })).getByText('Not started')).toBeTruthy();
    for (const id of ['status-progress', 'status-circle']) {
      expect(screen.queryAllByTestId(id, { includeHiddenElements: true })).toHaveLength(0);
    }
    for (const node of screen.queryAllByTestId('status-check', { includeHiddenElements: true })) {
      expect(node.props.importantForAccessibility).toBe('no-hide-descendants');
    }
  });

  it('draws the check in success-700, and it keeps 3:1 on the panel colour', () => {
    setup({ ...anna, recipientsNotified: { announcement: ['c1'] }, momentCompletedAt: { announce: '2026-10-02T12:00:00.000Z' } } as unknown as Session);
    const check = screen.getAllByTestId('status-check', { includeHiddenElements: true })[0];
    expect(check.findByType(Path).props.stroke).toBe(colors['success-700']);
    expect(contrast(colors['success-700'], colors.surface)).toBeGreaterThanOrEqual(3);
  });

  it('names what is missing on an obituary that waits for its link', () => {
    setup({ ...anna, obituaryText: 'Anna loved the garden.' } as Session);
    expect(within(screen.getByRole('button', { name: /Share the obituary/ })).getByText('Needs the obituary link')).toBeTruthy();
  });

  it('shows no status sentence on any row, in text or in a name', () => {
    setup({ ...anna, recipientsNotified: { announcement: ['c1', 'c2'] }, momentCompletedAt: { announce: '2026-10-02T12:00:00.000Z' }, obituaryText: 'x' } as unknown as Session);
    const tree = JSON.stringify(screen.toJSON());
    expect(tree).not.toMatch(/Sent to 0|Started|Waiting for the link|Ready"/);
  });

  it('shows the done check and no "Sent to 0" for a row whose status is { sent: 0 } (emailed obituary)', () => {
    // An obituary emailed to the publisher, with nobody texted.
    const emailed = { ...anna, obituaryEmailedAt: '2026-11-04T10:00:00.000Z', recipientsNotified: {} } as unknown as Session;
    setup(emailed);
    const row = screen.getByRole('button', { name: 'Share the obituary, Emailed to the paper, Sent' });
    expect(within(row).getByTestId('status-check', { includeHiddenElements: true })).toBeTruthy();
    expect(JSON.stringify(screen.toJSON())).not.toMatch(/Sent to/);
    expect(screen.queryByRole('button', { name: /Sent to/ })).toBeNull();
  });

  it('keeps the Needs line on a row that needs a detail', () => {
    setup({ ...anna, recipientsNotified: { announcement: ['c1'] }, momentCompletedAt: { announce: '2026-10-02T12:00:00.000Z' } } as unknown as Session);
    expect(within(screen.getByRole('button', { name: /Share the obituary/ })).getByText(/Needs the obituary link/)).toBeTruthy();
  });

  it('opens the step from a done row', () => {
    const { onStart } = setup({ ...anna, recipientsNotified: { announcement: ['c1'] }, momentCompletedAt: { announce: '2026-10-02T12:00:00.000Z' } } as unknown as Session);
    fireEvent.press(screen.getByRole('button', { name: 'Announce the passing, Sent to 1 person, Sent' }));
    expect(onStart).toHaveBeenLastCalledWith('announce');
  });

  it('shows the status lines in the real order, in each row\'s name', () => {
    const mixed = {
      ...anna,
      serviceDate: 'June 14, 2026',
      serviceTime: '2:00 PM',
      servicePlace: 'St Mary',
      recipientsNotified: { announcement: ['c1'] },
      momentCompletedAt: { announce: '2026-10-02T12:00:00.000Z' },
    } as unknown as Session;
    setup(mixed);
    expect(screen.getByRole('button', { name: 'Announce the passing, Sent to 1 person, Sent' })).toBeTruthy();
    // The service is the lit card; "Ready" is no longer a sentence.
    expect(screen.queryByText('Ready')).toBeNull();
    expect(within(screen.getByRole('button', { name: /Share the obituary/ })).getByText(/Needs the obituary link/)).toBeTruthy();
    expect(within(screen.getByRole('button', { name: /Send thank-yous/ })).getByText(/Needs your name/)).toBeTruthy();
    const tree = JSON.stringify(screen.toJSON());
    const at = ['Announce the passing', 'Share the service', 'Share the obituary', 'Send thank-yous'].map((t) => tree.indexOf(t));
    expect([...at].sort((x, y) => x - y)).toEqual(at);
    expect(at.every((i) => i >= 0)).toBe(true);
  });

  it('the obituary card is in progress, with no sentence, once its text is written and the link is not', () => {
    setup({ ...anna, obituaryText: 'Anna loved the garden.' } as Session);
    const card = screen.getByRole('button', { name: /Share the obituary.*In progress$/ });
    expect(within(card).queryByText(/Waiting for the link/)).toBeNull();
    expect(within(card).getByText('Needs the obituary link')).toBeTruthy();
  });

  it('lights exactly one card, puts Continue last in its name, and a press on it starts that step', () => {
    const { onStart } = setup();
    const lit = screen.getAllByTestId('hub-next-card');
    expect(lit).toHaveLength(1);
    expect(lit[0].props.accessibilityLabel).toMatch(/, Not started, Continue$/);
    expect(within(lit[0]).queryByText('Ready')).toBeNull();
    expect(within(lit[0]).getByText('Announce the passing')).toBeTruthy();
    expect(within(lit[0]).getByText('Continue')).toBeTruthy();
    fireEvent.press(lit[0]);
    expect(onStart).toHaveBeenLastCalledWith('announce');
  });

  it('keeps the status line on locked rows when payments are on', () => {
    setup(anna, true);
    const service = screen.getByRole('button', { name: /Share the service/ });
    expect(service.props.accessibilityHint).toBe('Included with the full plan');
    expect(within(screen.getByRole('button', { name: /Share the service/ })).getByText(/Needs the service date/)).toBeTruthy();
    const thanks = screen.getByRole('button', { name: /Send thank-yous/ });
    expect(thanks.props.accessibilityHint).toBe('Included with the full plan');
    expect(within(thanks).getByText(/Needs your name/)).toBeTruthy();
  });

  it('Android Back is never taken by the screen: with no sheet it leaves the app, with one the sheet closes itself', () => {
    const handlers: (() => boolean)[] = [];
    jest.spyOn(BackHandler, 'addEventListener').mockImplementation((_event, h) => {
      handlers.push(h as () => boolean);
      return { remove: () => undefined };
    });
    setup();
    expect(handlers.some((h) => h())).toBe(false);
    fireEvent.press(checklistButton());
    expect(handlers.some((h) => h())).toBe(false);
    // The open sheet shuts through its own Back request.
    act(() => checklistModal().props.onRequestClose());
    expect(checklistModal().props.visible).toBe(false);
  });

  it('with payments on, locks the paid steps: focusable, not disabled, with the reason as a hint', () => {
    const { onStart } = setup(anna, true);
    const service = screen.getByRole('button', { name: /Share the service/ });
    // No accessibility disabled state: on native it swallows the tap, and TalkBack can refuse it (#292).
    expect(service.props.accessibilityState?.disabled).not.toBe(true);
    expect(service.props.accessibilityHint).toBe('Included with the full plan');
    expect(screen.getByRole('button', { name: /Send thank-yous/ }).props.accessibilityHint).toBe('Included with the full plan');
    fireEvent.press(service);
    expect(onStart).not.toHaveBeenCalled();
    expect(screen.getByText('Payment details will go here.')).toBeTruthy();
  });

  it('after the placeholder is dismissed, screen-reader focus goes back to the locked row', () => {
    const focus = jest.spyOn(AccessibilityInfo, 'setAccessibilityFocus').mockImplementation(() => undefined);
    setup(anna, true);
    focus.mockClear();
    fireEvent.press(screen.getByRole('button', { name: /Share the service/ }));
    act(() => paywallModal().props.onDismiss());
    expect(focusedNode(focus)?.props.accessibilityHint).toBe('Included with the full plan');
  });

  it('on Android, closing the placeholder sends focus back to the locked row (onDismiss is iOS only)', () => {
    jest.useFakeTimers();
    const focus = jest.spyOn(AccessibilityInfo, 'setAccessibilityFocus').mockImplementation(() => undefined);
    const original = Platform.OS;
    Platform.OS = 'android';
    try {
      setup(anna, true);
      focus.mockClear();
      fireEvent.press(screen.getByRole('button', { name: /Share the service/ }));
      fireEvent.press(screen.getByRole('button', { name: 'Close' }));
      act(() => {
        jest.runAllTimers();
      });
      expect(focusedNode(focus)?.props.accessibilityHint).toBe('Included with the full plan');
    } finally {
      Platform.OS = original;
      jest.useRealTimers();
    }
  });

  it('shows a lock icon on locked rows only, hidden from screen readers', () => {
    setup(anna, true);
    const service = screen.getByRole('button', { name: /Share the service/ });
    const icons = screen.getAllByTestId('lock-icon', { includeHiddenElements: true });
    // Only the two locked rows carry an icon, and each is hidden from screen readers.
    expect(icons).toHaveLength(2);
    for (const icon of icons) {
      expect(icon.props.importantForAccessibility).toBe('no-hide-descendants');
      expect(icon.props.accessibilityElementsHidden).toBe(true);
    }
    // The reason stays the hint.
    expect(service.props.accessibilityHint).toBe('Included with the full plan');
  });

  it('opens the shared paywall sheet: a modal with the heading, one line and a Close button', () => {
    setup(anna, true);
    fireEvent.press(screen.getByRole('button', { name: /Share the service/ }));
    expect(screen.getByRole('heading', { name: 'The full plan' })).toBeTruthy();
    expect(screen.getByText('Payment details will go here.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Close' })).toBeTruthy();
    expect(screen.UNSAFE_getByProps({ accessibilityViewIsModal: true })).toBeTruthy();
  });

  it('closes the paywall sheet on the Android Back gesture (onRequestClose)', () => {
    setup(anna, true);
    fireEvent.press(screen.getByRole('button', { name: /Share the service/ }));
    const paywall = screen.UNSAFE_getAllByType(Modal).find((m) => m.props.visible);
    act(() => paywall?.props.onRequestClose());
    expect(screen.UNSAFE_getAllByType(Modal).every((m) => !m.props.visible)).toBe(true);
  });

  it('draws the heading in Source Serif once the app has loaded the font (the provider App.tsx supplies)', () => {
    render(
      <SerifReadyContext.Provider value>
        <HubScreen session={anna} others={[]} onSwitch={jest.fn()} onStart={jest.fn()} onSetItem={jest.fn()} onEditPerson={jest.fn()} />
      </SerifReadyContext.Provider>,
    );
    const heading = screen.getByRole('heading', { name: 'Ready to send' });
    expect(StyleSheet.flatten(heading.props.style).fontFamily).toBe('SourceSerif4_600SemiBold');
    expect(StyleSheet.flatten(screen.getByText("Send when you're ready.").props.style).fontFamily).toBe('SourceSerif4_400Regular');
  });

  it('keeps the system font until the serif is ready', () => {
    render(
      <SerifReadyContext.Provider value={false}>
        <HubScreen session={anna} others={[]} onSwitch={jest.fn()} onStart={jest.fn()} onSetItem={jest.fn()} onEditPerson={jest.fn()} />
      </SerifReadyContext.Provider>,
    );
    const heading = screen.getByRole('heading', { name: 'Ready to send' });
    expect(StyleSheet.flatten(heading.props.style).fontFamily).toBeUndefined();
  });

  it('with payments off, locks nothing', () => {
    setup(anna, false);
    expect(screen.getByRole('button', { name: /Share the service/ }).props.accessibilityHint).toBeUndefined();
  });

  it('uses no exclamation points', () => {
    setup();
    expect(JSON.stringify(screen.toJSON())).not.toContain('!');
  });

  it('names the first missing required field in the status line (#654)', () => {
    setup(anna, true);
    const lines = screen.getAllByText(/^Needs /).map((n) => n.props.children);
    expect(lines).toEqual(expect.arrayContaining(['Needs the service date', 'Needs your name']));
    expect(lines).toContain('Needs the obituary link');
    expect(screen.queryByText('Needs a detail')).toBeNull();
  });

  it('has a plain name for every required template field (#654)', () => {
    const names = screenCopy('pathLanding').statusFieldNames as Record<string, string>;
    const required = templates.flatMap((t) => t.fields).filter((f) => f.required).map((f) => f.key);
    for (const key of required) {
      expect(names[key]).toBeTruthy();
    }
  });

  it('moves to the next missing field once the first is filled', () => {
    setup({ ...anna, serviceDate: 'June 14, 2026', serviceTime: '2:00 PM' } as Session, true);
    expect(screen.getByText('Needs the place')).toBeTruthy();
  });

  it('draws every available row as a filled panel card: surface fill, no border, 44 pt, darker when pressed', () => {
    setup({ ...anna, recipientsNotified: { announcement: ['c1'] }, momentCompletedAt: { announce: '2026-10-02T12:00:00.000Z' } } as unknown as Session);
    for (const name of [/^Announce the passing/, /^Share the service/, /^Share the obituary/, /^Send thank-yous/]) {
      // The host node has the resolved style; the Pressable above it holds the function that takes `pressed`.
      let card = screen.getAllByRole('button', { name })[0].parent;
      while (card && typeof card.props.style !== 'function') {
        card = card.parent;
      }
      expect(card).toBeTruthy();
      const rest = StyleSheet.flatten(card?.props.style({ pressed: false }));
      const pressed = StyleSheet.flatten(card?.props.style({ pressed: true }));
      expect(rest.backgroundColor).toBe(colors.surface);
      expect(rest.borderWidth).toBeUndefined();
      expect(rest.minHeight).toBeGreaterThanOrEqual(44);
      expect(pressed.backgroundColor).not.toBe(colors.surface);
      expect(luminance(pressed.backgroundColor as string)).toBeLessThan(luminance(colors.surface));
      // Muted text, accent text and the state word keep 4.5:1 on the resting and the pressed panel.
      for (const bg of [colors.surface, pressed.backgroundColor as string]) {
        expect(contrast(colors['neutral-700'], bg)).toBeGreaterThanOrEqual(4.5);
        expect(contrast(colors['accent-700'], bg)).toBeGreaterThanOrEqual(4.5);
        expect(contrast(colors['neutral-800'], bg)).toBeGreaterThanOrEqual(4.5);
        // The check is a graphic: 3:1 (WCAG 1.4.11).
        expect(contrast(colors['success-700'], bg)).toBeGreaterThanOrEqual(3);
      }
    }
  });

  it('gives only the next card the accent bar and the Continue line', () => {
    setup();
    expect(screen.getAllByTestId('next-bar')).toHaveLength(1);
    expect(screen.getAllByText('Continue')).toHaveLength(1);
    const lit = screen.getByTestId('hub-next-card');
    expect(within(lit).getByTestId('next-bar')).toBeTruthy();
    const bar = StyleSheet.flatten(screen.getByTestId('next-bar').props.style);
    expect(bar.width).toBe(3);
    expect(bar.backgroundColor).toBe(colors['accent-700']);
    expect(bar.left).toBe(0);
    expect(within(screen.getByRole('button', { name: /^Share the service/ })).queryByText('Continue')).toBeNull();
  });

  it('builds each summary from the phone session, and the Needs line replaces it', () => {
    const long = `${'x'.repeat(90)}`;
    setup({
      ...anna,
      announcementMessage: `\n  ${long}\nsecond line`,
      senderName: 'Sam',
      serviceTime: '2:00 PM',
      serviceType: 'Funeral',
      serviceDate: 'June 14, 2026',
      servicePlace: 'St Mary',
      obituaryPublisher: 'The Daily News',
      thanksMessage: 'Thank you all',
    } as unknown as Session);
    expect(screen.getByText(`${'x'.repeat(80)}…`)).toBeTruthy();
    expect(screen.getByText('Funeral, June 14, 2026 at St Mary')).toBeTruthy();
    // The obituary and the thanks both need something, so their Needs line shows instead.
    const obit = screen.getByRole('button', { name: /^Share the obituary/ });
    expect(within(obit).getByText('Needs the obituary link')).toBeTruthy();
    expect(within(obit).queryByText('Published in The Daily News')).toBeNull();
    expect(obit.props.accessibilityLabel).toBe('Share the obituary, Needs the obituary link, Not started');
  });

  it('falls back to the empty and draft summaries', () => {
    setup({ ...anna, obituaryText: 'Anna loved the garden.', obituaryUrl: 'https://paper.test/anna', thanksMessage: 'Thanks' } as unknown as Session, false);
    expect(screen.getByText('Write a short note')).toBeTruthy();
    expect(screen.getByText('Draft started')).toBeTruthy();
  });

  it('reads title, summary and state once as the name of each row', () => {
    setup({ ...anna, recipientsNotified: { announcement: ['c1'] }, momentCompletedAt: { announce: '2026-10-02T12:00:00.000Z' }, announcementMessage: 'Anna has died.' } as unknown as Session);
    expect(screen.getByRole('button', { name: 'Announce the passing, Sent to 1 person, Sent' })).toBeTruthy();
    // A card that needs something reads the Needs line in place of the summary.
    expect(screen.getByRole('button', { name: 'Share the service, Needs the service date, Not started' })).toBeTruthy();
  });

  it('names a Sent row by who was told: pinned for a texted announcement, a texted obituary and an emailed-only obituary', () => {
    const texted = { announcement: ['c1', 'c2', 'c3'], obituary: ['c1'] };
    const base = { ...anna, recipientsNotified: texted, momentCompletedAt: { announce: '2026-10-02T12:00:00.000Z' }, obituaryUrl: 'https://paper.test/anna' } as unknown as Session;
    const first = render(<HubScreen session={base} paymentsEnabled={false} others={[]} onSwitch={jest.fn()} onStart={jest.fn()} onSetItem={jest.fn()} onEditPerson={jest.fn()} />);
    expect(screen.getByRole('button', { name: 'Announce the passing, Sent to 3 people, Sent' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Share the obituary, Sent to 1 person, Sent' })).toBeTruthy();
    first.unmount();
    // Emailed to the paper with nobody texted.
    const emailed = { ...anna, obituaryEmailedAt: '2026-11-04T10:00:00.000Z', recipientsNotified: {} } as unknown as Session;
    const second = render(<HubScreen session={emailed} paymentsEnabled={false} others={[]} onSwitch={jest.fn()} onStart={jest.fn()} onSetItem={jest.fn()} onEditPerson={jest.fn()} />);
    expect(screen.getByRole('button', { name: 'Share the obituary, Emailed to the paper, Sent' })).toBeTruthy();
    expect(JSON.stringify(screen.toJSON())).not.toMatch(/Start with a draft|Sent to 0/);
    second.unmount();
  });

  it('keeps locked rows as they were: lock icon, reason, no state word', () => {
    setup(anna, true);
    expect(screen.getAllByTestId('lock-icon', { includeHiddenElements: true }).length).toBeGreaterThan(0);
    const locked = screen.getByRole('button', { name: /Share the service/ });
    expect(within(locked).queryByText('Not started')).toBeNull();
  });
});

describe('HubScreen: the next card and the bottom button', () => {
  const announced = { recipientsNotified: { announcement: ['c1'] } };
  const ready = { senderName: 'Sam', serviceDate: 'November 8, 2026', serviceTime: '2:00 PM', servicePlace: 'St Mary' };
  const sess = (extra: object) => ({ ...anna, ...extra }) as unknown as Session;
  const props = { paymentsEnabled: false, others: [] as Session[], onSwitch: jest.fn(), onStart: jest.fn(), onSetItem: jest.fn(), onEditPerson: jest.fn() };

  it('lights the service once the announcement is done, and the bottom button names it', () => {
    const { onStart } = setup(sess({ ...announced, ...ready }));
    expect(within(screen.getAllByTestId('hub-next-card')[0]).getByText('Share the service')).toBeTruthy();
    fireEvent.press(bottomButton());
    expect(onStart).toHaveBeenLastCalledWith('service');
  });

  it.each([
    ['the link is set', { obituaryUrl: 'https://paper.test/anna' }],
    ['the text is written and the link is missing', { obituaryText: 'Anna loved the garden.' }],
  ])('names the obituary button "Share the obituary" and starts it when %s', (_state, extra) => {
    const { onStart } = setup(sess({ ...ready, recipientsNotified: { announcement: ['a'], service: ['b'] }, ...extra }));
    expect(screen.getAllByTestId('hub-next-card')).toHaveLength(1);
    expect(within(bottomButton()).getByText('Share the obituary')).toBeTruthy();
    fireEvent.press(bottomButton());
    expect(onStart).toHaveBeenLastCalledWith('obituary');
  });

  it('names the first open card when none is lit', () => {
    const { onStart } = setup(sess(announced));
    expect(screen.queryByTestId('hub-next-card')).toBeNull();
    // The announcement is done, so the button names the first card still open: the service.
    expect(within(bottomButton()).getByText('Share the service')).toBeTruthy();
    fireEvent.press(bottomButton());
    expect(onStart).toHaveBeenLastCalledWith('service');
  });

  it('falls back to the announcement only when no card is left', () => {
    const sent = { announcement: ['a'], service: ['b'], obituary: ['c'] };
    setup(sess({ ...ready, obituaryUrl: 'https://paper.test/anna', recipientsNotified: sent, serviceDate: 'January 2, 2999' }));
    expect(within(bottomButton()).getByText('Announce the passing')).toBeTruthy();
  });

  it('a done row with a re-send draft stays done, with no Started', () => {
    const draft = freshDraft({ templateCategory: 'announcement', step: 'details', fields: { senderName: 'Sam' } });
    setup(sess({ ...announced, drafts: { announcement: draft } }));
    expect(screen.getByRole('button', { name: 'Announce the passing, Sent to 1 person, Sent' })).toBeTruthy();
    expect(screen.queryByText(/Started|Sent to 0/)).toBeNull();
  });

  it('lights the thank-yous only after a service date that parses and is past', () => {
    const everything = { ...ready, obituaryUrl: 'https://paper.test/anna', recipientsNotified: { announcement: ['a'], service: ['b'], obituary: ['c'] } };
    const past = render(<HubScreen session={sess({ ...everything, serviceDate: 'January 2, 2020' })} {...props} />);
    expect(within(bottomButton()).getByText('Send thank-yous')).toBeTruthy();
    expect(screen.getAllByTestId('hub-next-card')).toHaveLength(1);
    past.unmount();
    for (const serviceDate of ['next Saturday', '', 'January 2, 2999']) {
      const view = render(<HubScreen session={sess({ ...everything, serviceDate })} {...props} />);
      expect(screen.queryByTestId('hub-next-card')).toBeNull();
      view.unmount();
    }
  });

  it('never lights a locked card, and the bar names the first open card that is not locked', () => {
    setup(sess({ ...announced, ...ready }), true);
    expect(screen.queryByTestId('hub-next-card')).toBeNull();
    expect(within(bottomButton()).getByText('Share the obituary')).toBeTruthy();
  });

  it('after a stopped send, the card shows progress and is the lit card', () => {
    const note = { lead: 'You told 1 of 3.', rest: 'You can text the others.', spoken: 'You told 1 of 3.', category: 'announcement' as const, partial: true };
    const onStart = jest.fn();
    render(<HubScreen session={sess({ ...announced, ...ready })} {...props} onStart={onStart} note={note} />);
    const lit = screen.getAllByTestId('hub-next-card');
    expect(lit).toHaveLength(1);
    expect(lit[0].props.accessibilityLabel).toMatch(/, In progress, Continue$/);
    expect(within(lit[0]).getByText('In progress')).toBeTruthy();
    expect(within(lit[0]).queryByText(/Sent to|text the rest/)).toBeNull();
    fireEvent.press(bottomButton());
    expect(onStart).toHaveBeenLastCalledWith('announce');
  });

  it('a note that is not a stopped send does not light its card', () => {
    const note = { lead: 'Everyone has been told.', rest: 'Kept private.', spoken: 'x', category: 'announcement' as const, partial: false };
    render(<HubScreen session={sess(announced)} {...props} note={note} />);
    expect(screen.queryByText(/text the rest/)).toBeNull();
    expect(screen.getByRole('button', { name: 'Announce the passing, Sent to 1 person, Sent' })).toBeTruthy();
    expect(screen.queryByTestId('hub-next-card')).toBeNull();
  });

  it('keeps the bar outside the scrolling area, so the cards stay reachable at the largest text size', () => {
    setup();
    const scroll = screen.UNSAFE_getByType(ScrollView);
    expect(StyleSheet.flatten(scroll.props.style).flex).toBe(1);
    expect(StyleSheet.flatten(scroll.props.contentContainerStyle).height).toBeUndefined();
    expect(within(scroll).getAllByRole('button')).not.toContain(bottomButton());
  });

  it('does not announce when the bottom button changes, and the bar has no live region', () => {
    const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => undefined);
    const ios = jest.spyOn(AccessibilityInfo, 'announceForAccessibilityWithOptions').mockImplementation(() => undefined);
    // The spies may carry calls from an earlier test in this file.
    announce.mockClear();
    ios.mockClear();
    const view = render(<HubScreen session={anna} {...props} />);
    view.rerender(<HubScreen session={sess({ ...announced, ...ready })} {...props} />);
    expect(within(bottomButton()).getByText('Share the service')).toBeTruthy();
    expect(announce).not.toHaveBeenCalled();
    expect(ios).not.toHaveBeenCalled();
    expect(screen.UNSAFE_queryAllByProps({ accessibilityLiveRegion: 'polite' })).toHaveLength(0);
  });
});
