import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from '@jest/globals';
import { useState } from 'react';
import { AccessibilityInfo, Modal, StyleSheet } from 'react-native';
import {
  act,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { fill, screenCopy } from '@griever/copy';
import { CHECKLIST_PHASES } from '@griever/shared';
import type {
  ChecklistFields,
  ChecklistItemId,
  ChecklistItemState,
} from '@griever/shared';
import { CHECKLIST, CHECKLIST_KEY } from '../screens/WhatYoullNeedScreen';
import { PersonChecklistSheet } from './PersonChecklistSheet';

// Jest has no native view tree. Each node gets its own fake handle, so a test can tell which node took focus.
// This path is specific to react-native 0.81 (Expo SDK 54). Re-check it when react-native is upgraded.
const mockHandles = new Map<unknown, number>();
jest.mock('react-native/Libraries/ReactNative/RendererProxy', () => ({
  ...jest.requireActual<object>(
    'react-native/Libraries/ReactNative/RendererProxy',
  ),
  findNodeHandle: (node: unknown) => {
    if (!mockHandles.has(node)) {
      mockHandles.set(node, mockHandles.size + 1);
    }
    return mockHandles.get(node);
  },
}));

const phrases = screenCopy('cmsChecklist');
const copy = screenCopy('phoneChecklist');
const RIGHT_AWAY = phrases.phases['right-away'];
const itemIds =
  CHECKLIST_PHASES.find((phase) => phase.key === 'right-away')?.itemIds ?? [];
const first = itemIds[0] as ChecklistItemId;
const firstLabel = phrases.items[first];

type Checklist = ChecklistFields['checklist'];

/** Stands in for useSessions: keeps the person's ticks and records each save. */
function Harness({
  start,
  onSave,
  onClose = jest.fn(),
}: {
  start: Checklist;
  onClose?: () => void;
  onSave: (id: ChecklistItemId, state: ChecklistItemState | null) => void;
}) {
  const [checklist, setChecklist] = useState<Checklist>(start);
  return (
    <PersonChecklistSheet
      visible
      onClose={onClose}
      checklist={checklist}
      onSetItem={(id, state) => {
        onSave(id, state);
        setChecklist((before) => {
          const next = { ...before };
          if (state === null) {
            delete next[id];
          } else {
            next[id] = state;
          }
          return next;
        });
      }}
    />
  );
}

/** Lets the deferred focus calls (setTimeout 0) run. */
const flush = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

const open = async (groupLabel: string, start: Checklist = {}) => {
  const onSave =
    jest.fn<(id: ChecklistItemId, state: ChecklistItemState | null) => void>();
  render(<Harness start={start} onSave={onSave} />);
  await act(async () => {});
  fireEvent.press(screen.getByRole('button', { name: groupLabel }));
  await flush();
  return onSave;
};
const tickRow = (label: string) =>
  screen.getByRole('checkbox', { name: label });

describe('ChecklistGroupPanel (#697)', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    await AsyncStorage.removeItem(CHECKLIST_KEY);
  });
  afterEach(async () => {
    jest.restoreAllMocks();
    await AsyncStorage.removeItem(CHECKLIST_KEY);
  });

  it('opens the group in the same sheet: one Modal, the items shown, the list hidden', async () => {
    await open(RIGHT_AWAY);
    expect(screen.UNSAFE_getAllByType(Modal)).toHaveLength(1);
    for (const id of itemIds) {
      expect(
        screen.getByText(phrases.items[id as ChecklistItemId]),
      ).toBeTruthy();
    }
    expect(screen.queryByText(copy.staysOnPhone)).toBeNull();
    expect(
      screen.queryByRole('button', { name: phrases.phases['first-days'] }),
    ).toBeNull();
  });

  it('Back returns to the group list', async () => {
    await open(RIGHT_AWAY);
    fireEvent.press(screen.getByRole('button', { name: phrases.back }));
    expect(screen.getByText(copy.staysOnPhone)).toBeTruthy();
    expect(
      screen.getByRole('button', { name: phrases.phases['first-days'] }),
    ).toBeTruthy();
    expect(screen.UNSAFE_getAllByType(Modal)).toHaveLength(1);
  });

  it('keeps the very same Modal, still visible, through open and Back (no remount)', async () => {
    const onSave = jest.fn();
    render(<Harness start={{}} onSave={onSave} />);
    await flush();
    const before = screen.UNSAFE_getByType(Modal);
    fireEvent.press(screen.getByRole('button', { name: RIGHT_AWAY }));
    await flush();
    expect(screen.UNSAFE_getByType(Modal)).toBe(before);
    expect(screen.UNSAFE_getByType(Modal).props.visible).toBe(true);
    fireEvent.press(screen.getByRole('button', { name: phrases.back }));
    await flush();
    expect(screen.UNSAFE_getByType(Modal)).toBe(before);
    expect(screen.UNSAFE_getByType(Modal).props.visible).toBe(true);
  });

  it('shows the list again when the sheet is hidden and shown while a panel was open', async () => {
    const sheet = (visible: boolean) => (
      <PersonChecklistSheet
        visible={visible}
        onClose={jest.fn()}
        checklist={{}}
        onSetItem={jest.fn()}
      />
    );
    const view = render(sheet(true));
    await flush();
    fireEvent.press(screen.getByRole('button', { name: RIGHT_AWAY }));
    await flush();
    view.rerender(sheet(false));
    view.rerender(sheet(true));
    await flush();
    expect(screen.getByText(copy.staysOnPhone)).toBeTruthy();
    expect(screen.queryByRole('button', { name: phrases.back })).toBeNull();
  });

  it('Android Back inside the panel goes Back and does not close the sheet', async () => {
    const onClose = jest.fn();
    render(<Harness start={{}} onSave={jest.fn()} onClose={onClose} />);
    await flush();
    fireEvent.press(screen.getByRole('button', { name: RIGHT_AWAY }));
    await flush();
    act(() => screen.UNSAFE_getByType(Modal).props.onRequestClose());
    expect(screen.getByText(copy.staysOnPhone)).toBeTruthy();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("shows no Doesn't apply text or button on any row", async () => {
    await open(RIGHT_AWAY, { [first]: 'not_applicable' });
    expect(screen.queryByText(phrases.notApplicable)).toBeNull();
    expect(screen.queryByText(/doesn.t apply/i)).toBeNull();
    expect(
      screen.queryAllByRole('button', { name: /doesn.t apply/i }),
    ).toHaveLength(0);
    expect(screen.getAllByRole('checkbox')).toHaveLength(itemIds.length);
  });

  it('shows a saved not_applicable row as done, like a done row, and a press clears it', async () => {
    const second = itemIds[1] as ChecklistItemId;
    const onSave = await open(RIGHT_AWAY, {
      [first]: 'not_applicable',
      [second]: 'done',
    });
    const marked = tickRow(firstLabel);
    const done = tickRow(phrases.items[second]);
    expect(marked.props.accessibilityState.checked).toBe(true);
    expect(marked.props.accessibilityHint).toBeUndefined();
    expect(done.props.accessibilityHint).toBeUndefined();
    expect(within(marked).getByText(firstLabel)).toHaveStyle({
      textDecorationLine: 'line-through',
    });
    fireEvent.press(marked);
    expect(onSave.mock.calls).toEqual([[first, null]]);
    expect(tickRow(firstLabel).props.accessibilityState.checked).toBe(false);
  });

  it('ticks an item, saves it on the person and strikes it through', async () => {
    const onSave = await open(RIGHT_AWAY);
    fireEvent.press(tickRow(firstLabel));
    expect(onSave.mock.calls).toEqual([[first, 'done']]);
    expect(tickRow(firstLabel).props.accessibilityState.checked).toBe(true);
    expect(within(tickRow(firstLabel)).getByText(firstLabel)).toHaveStyle({
      textDecorationLine: 'line-through',
    });
  });

  it('un-ticks with a second press: the tick is cleared, not deleted (C9)', async () => {
    const onSave = await open(RIGHT_AWAY, { [first]: 'done' });
    fireEvent.press(tickRow(firstLabel));
    expect(onSave.mock.calls).toEqual([[first, null]]);
    expect(tickRow(firstLabel).props.accessibilityState.checked).toBe(false);
  });

  it('gives every row a full-width tick target of at least 44 pt and text of at least 15 pt', async () => {
    await open(RIGHT_AWAY);
    const flat = StyleSheet.flatten(tickRow(firstLabel).props.style);
    expect(flat.minHeight).toBeGreaterThanOrEqual(44);
    expect(flat.width).toBe('100%');
    const text = StyleSheet.flatten(
      within(tickRow(firstLabel)).getByText(firstLabel).props.style,
    );
    expect(text.fontSize).toBeGreaterThanOrEqual(15);
  });

  it('shows a phase as Done in the list after its items are ticked', async () => {
    await open(RIGHT_AWAY);
    for (const id of itemIds) {
      fireEvent.press(tickRow(phrases.items[id as ChecklistItemId]));
    }
    fireEvent.press(screen.getByRole('button', { name: phrases.back }));
    expect(
      screen.getByRole('button', { name: `${RIGHT_AWAY}. Done` }),
    ).toBeTruthy();
  });

  it('has no swipe actions and no delete', async () => {
    await open(RIGHT_AWAY);
    expect(screen.queryByText(/delete|remove/i)).toBeNull();
    expect(
      screen.UNSAFE_queryAllByProps({ onSwipeableOpen: expect.anything() }),
    ).toHaveLength(0);
  });

  it('announces once, queued, when the phase becomes Done, with no counts', async () => {
    const announce = jest
      .spyOn(AccessibilityInfo, 'announceForAccessibilityWithOptions')
      .mockImplementation(() => undefined);
    const [last, ...rest] = [...itemIds].reverse();
    await open(RIGHT_AWAY, Object.fromEntries(rest.map((id) => [id, 'done'])));
    expect(announce).not.toHaveBeenCalled();
    fireEvent.press(tickRow(phrases.items[last as ChecklistItemId]));
    expect(announce.mock.calls).toEqual([
      [fill(copy.phaseNowDone, { group: RIGHT_AWAY }), { queue: true }],
    ]);
    expect(announce.mock.calls[0][0]).not.toMatch(/\d+\s*(of|\/)\s*\d+|%|!/);
  });

  it('announces nothing when the opened phase is already fully done', async () => {
    const queued = jest
      .spyOn(AccessibilityInfo, 'announceForAccessibilityWithOptions')
      .mockImplementation(() => undefined);
    const plain = jest
      .spyOn(AccessibilityInfo, 'announceForAccessibility')
      .mockImplementation(() => undefined);
    await open(
      RIGHT_AWAY,
      Object.fromEntries(itemIds.map((id) => [id, 'done'])),
    );
    await flush();
    expect(queued).not.toHaveBeenCalled();
    expect(plain).not.toHaveBeenCalled();
  });

  it('announces again when an item is un-ticked and ticked again', async () => {
    const announce = jest
      .spyOn(AccessibilityInfo, 'announceForAccessibilityWithOptions')
      .mockImplementation(() => undefined);
    const [last, ...rest] = [...itemIds].reverse();
    await open(RIGHT_AWAY, Object.fromEntries(rest.map((id) => [id, 'done'])));
    const row = () => tickRow(phrases.items[last as ChecklistItemId]);
    fireEvent.press(row());
    fireEvent.press(row());
    fireEvent.press(row());
    expect(announce).toHaveBeenCalledTimes(2);
  });

  it('moves focus to the panel title on open and back to the group on Back', async () => {
    const focus = jest
      .spyOn(AccessibilityInfo, 'setAccessibilityFocus')
      .mockImplementation(() => undefined);
    await open(RIGHT_AWAY);
    const titleHandle = focus.mock.calls.at(-1)?.[0];
    expect(titleHandle).toBeDefined();
    fireEvent.press(screen.getByRole('button', { name: phrases.back }));
    await flush();
    const groupHandle = focus.mock.calls.at(-1)?.[0];
    expect(focus.mock.calls.length).toBeGreaterThanOrEqual(2);
    expect(groupHandle).not.toBe(titleHandle);
    // The node that took focus is the group's own button.
    const focused = [...mockHandles.entries()].find(
      ([, handle]) => handle === groupHandle,
    )?.[0] as { props?: { accessibilityLabel?: string } } | undefined;
    expect(focused?.props?.accessibilityLabel).toBe(RIGHT_AWAY);
  });

  describe('Gather when you can', () => {
    it("shows the five existing items with no Doesn't apply", async () => {
      await open(phrases.gatherHeading);
      expect(CHECKLIST).toHaveLength(5);
      for (const item of CHECKLIST) {
        expect(
          screen.getByRole('checkbox', {
            name: item.meta ? `${item.label}. ${item.meta}` : item.label,
          }),
        ).toBeTruthy();
      }
      expect(screen.queryByText(phrases.notApplicable)).toBeNull();
    });

    it('shows the Social Security tip under its row, always', async () => {
      await open(phrases.gatherHeading);
      expect(screen.getByText(phrases.gatherNotes.ssn)).toBeTruthy();
    });

    it('reads the saved device ticks', async () => {
      await AsyncStorage.setItem(CHECKLIST_KEY, JSON.stringify(['ssn']));
      await open(phrases.gatherHeading);
      const ssn = CHECKLIST.find((item) => item.id === 'ssn');
      expect(
        screen.getByRole('checkbox', { name: ssn?.label ?? '' }).props
          .accessibilityState.checked,
      ).toBe(true);
    });

    it('writes ticks to gg.checklist.v1 and clears them on a second press', async () => {
      await open(phrases.gatherHeading);
      fireEvent.press(
        screen.getByRole('checkbox', { name: 'Life insurance policies' }),
      );
      await act(async () => {});
      expect(
        JSON.parse((await AsyncStorage.getItem(CHECKLIST_KEY)) ?? '[]'),
      ).toEqual(['insurance']);
      fireEvent.press(
        screen.getByRole('checkbox', { name: 'Life insurance policies' }),
      );
      await act(async () => {});
      expect(
        JSON.parse((await AsyncStorage.getItem(CHECKLIST_KEY)) ?? 'x'),
      ).toEqual([]);
    });

    it('keeps the ticks after going Back and opening Gather again, and never shows Done on the list', async () => {
      await open(phrases.gatherHeading);
      fireEvent.press(
        screen.getByRole('checkbox', { name: 'Life insurance policies' }),
      );
      await act(async () => {});
      fireEvent.press(screen.getByRole('button', { name: phrases.back }));
      fireEvent.press(
        screen.getByRole('button', { name: phrases.gatherHeading }),
      );
      await act(async () => {});
      expect(
        screen.getByRole('checkbox', { name: 'Life insurance policies' }).props
          .accessibilityState.checked,
      ).toBe(true);
    });
  });
});
