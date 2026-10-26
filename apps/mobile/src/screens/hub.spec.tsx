import { describe, expect, it, jest } from '@jest/globals';
import { AccessibilityInfo, BackHandler, Modal, Platform, StyleSheet } from 'react-native';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import type { Session } from '@griever/hooks';
import { freshDraft } from '@griever/hooks';
import { SerifReadyContext } from '@griever/ui';
import { HubScreen } from './HubScreen';

// Jest has no native view tree, so findNodeHandle returns null. A fake handle lets the test see focus sent.
// This path is specific to this react-native version. Re-check it when react-native is upgraded.
jest.mock('react-native/Libraries/ReactNative/RendererProxy', () => ({
  ...jest.requireActual<object>('react-native/Libraries/ReactNative/RendererProxy'),
  findNodeHandle: () => 1,
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

describe('HubScreen', () => {
  it('shows the person, the heading and the four steps with one Start', () => {
    setup();
    expect(screen.getByRole('heading', { name: 'One thing at a time.' })).toBeTruthy();
    expect(screen.getByText('For Anna')).toBeTruthy();
    expect(screen.getAllByRole('button', { name: 'Start' })).toHaveLength(1);
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

  it('starts the announcement from Start, and a later step from its row', () => {
    const { onStart } = setup();
    fireEvent.press(screen.getByRole('button', { name: 'Start' }));
    expect(onStart).toHaveBeenLastCalledWith('announce');
    fireEvent.press(screen.getByRole('button', { name: /Send thank-yous/ }));
    expect(onStart).toHaveBeenLastCalledWith('thanks');
  });

  it('answers Back and Edit person', () => {
    const { onBack, onEditPerson } = setup();
    fireEvent.press(screen.getByRole('button', { name: 'Back' }));
    fireEvent.press(screen.getByRole('button', { name: 'Edit person' }));
    expect(onBack).toHaveBeenCalledTimes(1);
    expect(onEditPerson).toHaveBeenCalledTimes(1);
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

  it('shows a finished step with its count, and a started step as Continue', () => {
    const done = {
      ...anna,
      recipientsNotified: { announcement: ['c1', 'c2'] },
      momentCompletedAt: { announce: '2026-10-02T12:00:00.000Z' },
      drafts: { service: freshDraft({ templateCategory: 'service', step: 'details', fields: { serviceLocation: 'St Mary' } }) },
    } as unknown as Session;
    setup(done);
    expect(screen.getByRole('button', { name: /Told close family/ })).toBeTruthy();
    expect(screen.getByText(/2 people · October 2, 2026 · Send again/)).toBeTruthy();
    expect(screen.getByText('Started')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Continue' })).toBeTruthy();
  });

  it('opens What you will need in a sheet', () => {
    setup();
    fireEvent.press(screen.getByRole('button', { name: "What you'll need" }));
    expect(screen.UNSAFE_getAllByType(Modal).some((m) => m.props.visible === true)).toBe(true);
    expect(screen.getByText('Not today. Just so none of it surprises you.')).toBeTruthy();
  });

  it('Android Back goes Home, but not while a sheet is open', () => {
    let handler: (() => boolean) | undefined;
    jest.spyOn(BackHandler, 'addEventListener').mockImplementation((_event, h) => {
      handler = h as () => boolean;
      return { remove: () => undefined };
    });
    const { onBack } = setup();
    fireEvent.press(screen.getByRole('button', { name: "What you'll need" }));
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
    act(() => screen.UNSAFE_getAllByType(Modal).find((m) => m.props.onDismiss)?.props.onDismiss());
    expect(focus).toHaveBeenCalledWith(1);
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
      expect(focus).toHaveBeenCalledWith(1);
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

  it('after the checklist sheet is dismissed, screen-reader focus goes back to What you will need', () => {
    const focus = jest.spyOn(AccessibilityInfo, 'setAccessibilityFocus').mockImplementation(() => undefined);
    setup();
    focus.mockClear();
    fireEvent.press(screen.getByRole('button', { name: "What you'll need" }));
    act(() => screen.UNSAFE_getAllByType(Modal).find((m) => m.props.onDismiss)?.props.onDismiss());
    expect(focus).toHaveBeenCalledWith(1);
  });

  it('draws the heading in Source Serif once the app has loaded the font (the provider App.tsx supplies)', () => {
    render(
      <SerifReadyContext.Provider value>
        <HubScreen session={anna} onBack={jest.fn()} onStart={jest.fn()} onEditPerson={jest.fn()} />
      </SerifReadyContext.Provider>,
    );
    const heading = screen.getByRole('heading', { name: 'One thing at a time.' });
    expect(StyleSheet.flatten(heading.props.style).fontFamily).toBe('SourceSerif4_600SemiBold');
    expect(StyleSheet.flatten(screen.getByText("Here's what usually comes next.").props.style).fontFamily).toBe('SourceSerif4_400Regular');
  });

  it('keeps the system font until the serif is ready', () => {
    render(
      <SerifReadyContext.Provider value={false}>
        <HubScreen session={anna} onBack={jest.fn()} onStart={jest.fn()} onEditPerson={jest.fn()} />
      </SerifReadyContext.Provider>,
    );
    const heading = screen.getByRole('heading', { name: 'One thing at a time.' });
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
});
