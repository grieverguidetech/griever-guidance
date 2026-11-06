import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { AccessibilityInfo, BackHandler, Modal, Platform, ScrollView, StyleSheet } from 'react-native';
import { act, fireEvent, render, screen, within } from '@testing-library/react-native';
import type { Session } from '@griever/hooks';
import { freshDraft } from '@griever/hooks';
import { screenCopy } from '@griever/copy';
import { templates } from '@griever/shared';
import { colors } from '@griever/tokens';
import { SerifReadyContext } from '../ui';
import { HubScreen } from './HubScreen';

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

function setup(session: Session = anna, paymentsEnabled = false) {
  const handlers = { onBack: jest.fn(), onStart: jest.fn(), onEditPerson: jest.fn() };
  render(<HubScreen session={session} paymentsEnabled={paymentsEnabled} {...handlers} />);
  return handlers;
}

// The More sheet is the first Modal on the screen, the checklist the second.
const moreModal = () => screen.UNSAFE_getAllByType(Modal)[0];
const morePanel = () => within(moreModal());

// The handle the fake findNodeHandle gave the node that was focused last.
const handleOf = (predicate: (node: any) => boolean) => {
  const handles = (globalThis as unknown as { nodeHandles: Map<unknown, number> }).nodeHandles;
  return [...handles].find(([node]) => predicate(node))?.[1];
};

// The handle the fake gave the More button (found by its hint), so a test sees focus go to More and nowhere else.
const moreHandle = () => handleOf((node) => node?.props?.accessibilityHint === 'Opens a list of more options') ?? -1;

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
    (globalThis as unknown as { nodeHandles?: Map<unknown, number> }).nodeHandles?.clear();
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

  it('answers Home', () => {
    const { onBack } = setup();
    fireEvent.press(screen.getByRole('button', { name: 'Home' }));
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('has More on the top bar, and no What you will need or Edit person button until More is opened', () => {
    setup();
    expect(screen.getByRole('button', { name: 'More' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: "What you'll need" })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Edit person' })).toBeNull();
  });

  it('More opens a sheet with What you will need and Edit person, and nothing that deletes or removes', () => {
    setup();
    fireEvent.press(screen.getByRole('button', { name: 'More' }));
    const sheet = morePanel();
    expect(sheet.getAllByRole("button")).toHaveLength(3);
    expect(sheet.getByRole("button", { name: "What you'll need" })).toBeTruthy();
    expect(sheet.getByRole("button", { name: "Edit person" })).toBeTruthy();
    expect(sheet.getByRole("button", { name: "Close" })).toBeTruthy();
    expect(JSON.stringify(screen.toJSON())).not.toMatch(/delete|remove/i);
  });

  it('Edit person from More calls onEditPerson once the sheet has closed (iOS onDismiss)', () => {
    const { onEditPerson } = setup();
    fireEvent.press(screen.getByRole('button', { name: 'More' }));
    fireEvent.press(morePanel().getByRole('button', { name: 'Edit person' }));
    expect(onEditPerson).not.toHaveBeenCalled();
    act(() => moreModal().props.onDismiss());
    expect(onEditPerson).toHaveBeenCalledTimes(1);
  });

  it('What you will need from More opens the checklist sheet once More has closed', () => {
    setup();
    fireEvent.press(screen.getByRole('button', { name: 'More' }));
    fireEvent.press(morePanel().getByRole('button', { name: "What you'll need" }));
    act(() => moreModal().props.onDismiss());
    expect(screen.UNSAFE_getAllByType(Modal)[1].props.visible).toBe(true);
    expect(screen.getByText('Not today. Just so none of it surprises you.')).toBeTruthy();
  });

  it('a second close while More slides out does not drop the chosen item', () => {
    const { onEditPerson } = setup();
    fireEvent.press(screen.getByRole('button', { name: 'More' }));
    fireEvent.press(morePanel().getByRole('button', { name: 'Edit person' }));
    // Close or the backdrop while the sheet slides out (both call onRequestClose or onClose).
    act(() => moreModal().props.onRequestClose());
    act(() => moreModal().props.onDismiss());
    expect(onEditPerson).toHaveBeenCalledTimes(1);
  });

  it('gives More a hint on native', () => {
    setup();
    expect(screen.getByRole('button', { name: 'More' }).props.accessibilityHint).toBe('Opens a list of more options');
  });

  it('closing More with Close sends screen-reader focus back to More', () => {
    const focus = jest.spyOn(AccessibilityInfo, 'setAccessibilityFocus').mockImplementation(() => undefined);
    const { onEditPerson } = setup();
    fireEvent.press(screen.getByRole('button', { name: 'More' }));
    focus.mockClear();
    fireEvent.press(morePanel().getByRole('button', { name: 'Close' }));
    expect(moreModal().props.visible).toBe(false);
    act(() => moreModal().props.onDismiss());
    expect(focus).toHaveBeenCalledWith(moreHandle());
    expect(moreHandle()).toBeDefined();
    expect(onEditPerson).not.toHaveBeenCalled();
  });

  it('on Android, More does its item and returns focus without onDismiss', () => {
    jest.useFakeTimers();
    const original = Platform.OS;
    Platform.OS = 'android';
    try {
      const focus = jest.spyOn(AccessibilityInfo, 'setAccessibilityFocus').mockImplementation(() => undefined);
      const { onEditPerson } = setup();
      fireEvent.press(screen.getByRole('button', { name: 'More' }));
      fireEvent.press(morePanel().getByRole('button', { name: 'Edit person' }));
      act(() => {
        jest.runAllTimers();
      });
      expect(onEditPerson).toHaveBeenCalledTimes(1);
      fireEvent.press(screen.getByRole('button', { name: 'More' }));
      focus.mockClear();
      fireEvent.press(morePanel().getByRole('button', { name: 'Close' }));
      act(() => {
        jest.runAllTimers();
      });
      expect(focus).toHaveBeenCalledWith(moreHandle());
      expect(moreHandle()).toBeDefined();
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
    render(<HubScreen session={anna} paymentsEnabled={false} onBack={jest.fn()} onStart={jest.fn()} onEditPerson={jest.fn()} note={note} />);
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
    render(<HubScreen session={anna} paymentsEnabled={false} onBack={jest.fn()} onStart={jest.fn()} onEditPerson={jest.fn()} note={note} />);
    Platform.OS = original;
    expect(announce).not.toHaveBeenCalled();
    act(() => {
      jest.advanceTimersByTime(150);
    });
    expect(announce).toHaveBeenCalledWith(note.spoken);
    expect(announce).toHaveBeenCalledTimes(1);
    jest.useRealTimers();
  });

  it('Android Back goes Home', () => {
    let handler: (() => boolean) | undefined;
    jest.spyOn(BackHandler, 'addEventListener').mockImplementation((_event, h) => {
      handler = h as () => boolean;
      return { remove: () => undefined };
    });
    const { onBack } = setup();
    act(() => void handler?.());
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('shows a finished step as one compact row, and a started step as Started', () => {
    const done = {
      ...anna,
      recipientsNotified: { announcement: ['c1', 'c2'] },
      momentCompletedAt: { announce: '2026-10-02T12:00:00.000Z' },
      drafts: { service: freshDraft({ templateCategory: 'service', step: 'details', fields: { serviceLocation: 'St Mary' } }) },
    } as unknown as Session;
    setup(done);
    expect(screen.getByRole('button', { name: 'Announce the passing · Sent to 2 people' })).toBeTruthy();
    expect(screen.queryByText(/October 2, 2026|Send again/)).toBeNull();
    expect(screen.getByText(/Share the service · Started/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Continue' })).toBeNull();
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
    expect(screen.getByRole('button', { name: 'Announce the passing · Sent to 1 person' })).toBeTruthy();
    // The service is the lit card; its status sits in the card.
    expect(screen.getByText('Ready')).toBeTruthy();
    expect(within(screen.getByRole('button', { name: /Share the obituary/ })).getByText(/Needs the obituary link/)).toBeTruthy();
    expect(within(screen.getByRole('button', { name: /Send thank-yous/ })).getByText(/Needs your name/)).toBeTruthy();
    const tree = JSON.stringify(screen.toJSON());
    const at = ['Announce the passing', 'Share the service', 'Share the obituary', 'Send thank-yous'].map((t) => tree.indexOf(t));
    expect([...at].sort((x, y) => x - y)).toEqual(at);
    expect(at.every((i) => i >= 0)).toBe(true);
  });

  it('the obituary card reads "Waiting for the link" once its text is written and the link is not', () => {
    setup({ ...anna, obituaryText: 'Anna loved the garden.' } as Session);
    expect(within(screen.getByRole('button', { name: /Share the obituary/ })).getByText(/Waiting for the link/)).toBeTruthy();
  });

  it('lights exactly one card, names it Next, and a press on it starts that step', () => {
    const { onStart } = setup();
    const lit = screen.getAllByRole('button', { name: /Next/ });
    expect(lit).toHaveLength(1);
    expect(within(lit[0]).getByText('Ready')).toBeTruthy();
    expect(within(lit[0]).getByText('Announce the passing')).toBeTruthy();
    const style = StyleSheet.flatten(typeof lit[0].props.style === 'function' ? lit[0].props.style({ pressed: false }) : lit[0].props.style);
    expect(style.borderWidth).toBe(2);
    expect(style.borderColor).toBe(colors.accent);
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

  it('Android Back goes Home, but not while a sheet is open', () => {
    let handler: (() => boolean) | undefined;
    jest.spyOn(BackHandler, 'addEventListener').mockImplementation((_event, h) => {
      handler = h as () => boolean;
      return { remove: () => undefined };
    });
    const { onBack } = setup();
    fireEvent.press(screen.getByRole('button', { name: 'More' }));
    let handled = true;
    act(() => {
      handled = handler?.() ?? true;
    });
    expect(handled).toBe(false);
    expect(onBack).not.toHaveBeenCalled();
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
    act(() => screen.UNSAFE_getAllByType(Modal)[2].props.onDismiss());
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

  it('after the checklist sheet is dismissed, screen-reader focus goes back to More', () => {
    const focus = jest.spyOn(AccessibilityInfo, 'setAccessibilityFocus').mockImplementation(() => undefined);
    setup();
    fireEvent.press(screen.getByRole('button', { name: 'More' }));
    fireEvent.press(morePanel().getByRole('button', { name: "What you'll need" }));
    act(() => moreModal().props.onDismiss());
    focus.mockClear();
    act(() => screen.UNSAFE_getAllByType(Modal)[1].props.onDismiss());
    expect(focus).toHaveBeenCalledWith(moreHandle());
    expect(moreHandle()).toBeDefined();
  });

  it('draws the heading in Source Serif once the app has loaded the font (the provider App.tsx supplies)', () => {
    render(
      <SerifReadyContext.Provider value>
        <HubScreen session={anna} onBack={jest.fn()} onStart={jest.fn()} onEditPerson={jest.fn()} />
      </SerifReadyContext.Provider>,
    );
    const heading = screen.getByRole('heading', { name: 'Ready to send' });
    expect(StyleSheet.flatten(heading.props.style).fontFamily).toBe('SourceSerif4_600SemiBold');
    expect(StyleSheet.flatten(screen.getByText("Send when you're ready.").props.style).fontFamily).toBe('SourceSerif4_400Regular');
  });

  it('keeps the system font until the serif is ready', () => {
    render(
      <SerifReadyContext.Provider value={false}>
        <HubScreen session={anna} onBack={jest.fn()} onStart={jest.fn()} onEditPerson={jest.fn()} />
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

  it('uses the header variant for More, so it is not the first strong button', () => {
    setup();
    const edit = screen.getByRole('button', { name: 'More' });
    const flat = StyleSheet.flatten(typeof edit.props.style === 'function' ? edit.props.style({ pressed: false }) : edit.props.style);
    expect(flat.backgroundColor).toBeUndefined();
    expect(flat.borderColor).toBe(colors['accent-600']);
  });

  it('draws an edge around the finished and later steps, so they read as pressable', () => {
    const done = {
      ...anna,
      recipientsNotified: { announcement: ['c1'] },
      momentCompletedAt: { announce: '2026-10-02T12:00:00.000Z' },
    } as unknown as Session;
    setup(done);
    for (const name of [/Announce the passing · Sent/, /Share the obituary/]) {
      let box = screen.getByRole('button', { name }).parent;
      while (box && !StyleSheet.flatten(box.props.style)?.borderWidth) {
        box = box.parent;
      }
      const flat = StyleSheet.flatten(box?.props.style);
      expect(flat.borderWidth).toBe(1);
      expect(flat.borderColor).toBe(colors['neutral-600']);
    }
  });
});

describe('HubScreen: the next card and the bottom button', () => {
  const announced = { recipientsNotified: { announcement: ['c1'] } };
  const ready = { senderName: 'Sam', serviceDate: 'November 8, 2026', serviceTime: '2:00 PM', servicePlace: 'St Mary' };
  const sess = (extra: object) => ({ ...anna, ...extra }) as unknown as Session;
  const props = { paymentsEnabled: false, onBack: jest.fn(), onStart: jest.fn(), onEditPerson: jest.fn() };

  it('lights the service once the announcement is done, and the bottom button names it', () => {
    const { onStart } = setup(sess({ ...announced, ...ready }));
    expect(within(screen.getAllByRole('button', { name: /Next/ })[0]).getByText('Share the service')).toBeTruthy();
    fireEvent.press(bottomButton());
    expect(onStart).toHaveBeenLastCalledWith('service');
  });

  it.each([
    ['the link is set', { obituaryUrl: 'https://paper.test/anna' }],
    ['the text is written and the link is missing', { obituaryText: 'Anna loved the garden.' }],
  ])('names the obituary button "Share the obituary" and starts it when %s', (_state, extra) => {
    const { onStart } = setup(sess({ ...ready, recipientsNotified: { announcement: ['a'], service: ['b'] }, ...extra }));
    expect(screen.getAllByRole('button', { name: /Next/ })).toHaveLength(1);
    expect(within(bottomButton()).getByText('Share the obituary')).toBeTruthy();
    fireEvent.press(bottomButton());
    expect(onStart).toHaveBeenLastCalledWith('obituary');
  });

  it('names the first open card when none is lit', () => {
    const { onStart } = setup(sess(announced));
    expect(screen.queryByRole('button', { name: /Next/ })).toBeNull();
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

  it('keeps Started on a compact done row with a re-send draft in progress', () => {
    const draft = freshDraft({ templateCategory: 'announcement', step: 'details', fields: { senderName: 'Sam' } });
    setup(sess({ ...announced, drafts: { announcement: draft } }));
    expect(screen.getByText('Announce the passing · Sent to 1 person · Started')).toBeTruthy();
  });

  it('lights the thank-yous only after a service date that parses and is past', () => {
    const everything = { ...ready, obituaryUrl: 'https://paper.test/anna', recipientsNotified: { announcement: ['a'], service: ['b'], obituary: ['c'] } };
    const past = render(<HubScreen session={sess({ ...everything, serviceDate: 'January 2, 2020' })} {...props} />);
    expect(within(bottomButton()).getByText('Send thank-yous')).toBeTruthy();
    expect(screen.getAllByRole('button', { name: /Next/ })).toHaveLength(1);
    past.unmount();
    for (const serviceDate of ['next Saturday', '', 'January 2, 2999']) {
      const view = render(<HubScreen session={sess({ ...everything, serviceDate })} {...props} />);
      expect(screen.queryByRole('button', { name: /Next/ })).toBeNull();
      view.unmount();
    }
  });

  it('never lights a locked card, and the bar names the first open card that is not locked', () => {
    setup(sess({ ...announced, ...ready }), true);
    expect(screen.queryByRole('button', { name: /Next/ })).toBeNull();
    expect(within(bottomButton()).getByText('Share the obituary')).toBeTruthy();
  });

  it('after a stopped send, the card reads "text the rest" and is the lit card', () => {
    const note = { lead: 'You told 1 of 3.', rest: 'You can text the others.', spoken: 'You told 1 of 3.', category: 'announcement' as const, partial: true };
    const onStart = jest.fn();
    render(<HubScreen session={sess({ ...announced, ...ready })} {...props} onStart={onStart} note={note} />);
    const lit = screen.getAllByRole('button', { name: /Next/ });
    expect(lit).toHaveLength(1);
    expect(within(lit[0]).getByText('Sent to 1 person · text the rest')).toBeTruthy();
    fireEvent.press(bottomButton());
    expect(onStart).toHaveBeenLastCalledWith('announce');
  });

  it('a note that is not a stopped send does not light its card', () => {
    const note = { lead: 'Everyone has been told.', rest: 'Kept private.', spoken: 'x', category: 'announcement' as const, partial: false };
    render(<HubScreen session={sess(announced)} {...props} note={note} />);
    expect(screen.queryByText(/text the rest/)).toBeNull();
    expect(screen.queryByRole('button', { name: /Next/ })).toBeNull();
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
