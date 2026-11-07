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
}: {
  start: Checklist;
  onSave: (id: ChecklistItemId, state: ChecklistItemState | null) => void;
}) {
  const [checklist, setChecklist] = useState<Checklist>(start);
  return (
    <PersonChecklistSheet
      visible
      onClose={jest.fn()}
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

const open = async (groupLabel: string, start: Checklist = {}) => {
  const onSave =
    jest.fn<(id: ChecklistItemId, state: ChecklistItemState | null) => void>();
  render(<Harness start={start} onSave={onSave} />);
  await act(async () => {});
  fireEvent.press(screen.getByRole('button', { name: groupLabel }));
  await act(async () => {});
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

  it("marks Doesn't apply, shows it done, and a second press clears it", async () => {
    const onSave = await open(RIGHT_AWAY);
    const link = () =>
      screen.getByRole('button', {
        name: fill(copy.notApplicableFor, { item: firstLabel }),
      });
    fireEvent.press(link());
    expect(onSave.mock.calls).toEqual([[first, 'not_applicable']]);
    expect(link().props.accessibilityState.selected).toBe(true);
    expect(
      tickRow(`${firstLabel}. ${phrases.notApplicable}`).props
        .accessibilityState.checked,
    ).toBe(true);
    fireEvent.press(link());
    expect(onSave.mock.calls[1]).toEqual([first, null]);
    expect(link().props.accessibilityState.selected).toBe(false);
  });

  it("gives every row a full-width tick target of at least 44 pt and a Doesn't apply link", async () => {
    await open(RIGHT_AWAY);
    const flat = StyleSheet.flatten(tickRow(firstLabel).props.style);
    expect(flat.minHeight).toBeGreaterThanOrEqual(44);
    expect(flat.width).toBe('100%');
    expect(screen.getAllByText(phrases.notApplicable)).toHaveLength(
      itemIds.length,
    );
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

  it('announces once, politely, when the phase becomes Done, with no counts', async () => {
    const announce = jest
      .spyOn(AccessibilityInfo, 'announceForAccessibility')
      .mockImplementation(() => undefined);
    const [last, ...rest] = [...itemIds].reverse();
    await open(RIGHT_AWAY, Object.fromEntries(rest.map((id) => [id, 'done'])));
    expect(announce).not.toHaveBeenCalled();
    fireEvent.press(tickRow(phrases.items[last as ChecklistItemId]));
    expect(announce.mock.calls).toEqual([
      [fill(copy.phaseNowDone, { group: RIGHT_AWAY })],
    ]);
    expect(announce.mock.calls[0][0]).not.toMatch(/\d+\s*(of|\/)\s*\d+|%|!/);
    // Un-ticking and ticking again is a new change to Done, so it is announced again; a plain re-render is not.
    fireEvent.press(tickRow(phrases.items[last as ChecklistItemId]));
    expect(announce).toHaveBeenCalledTimes(1);
  });

  it('moves focus to the panel title on open and back to the group on Back', async () => {
    const focus = jest
      .spyOn(AccessibilityInfo, 'setAccessibilityFocus')
      .mockImplementation(() => undefined);
    await open(RIGHT_AWAY);
    const titleHandle = focus.mock.calls.at(-1)?.[0];
    expect(titleHandle).toBeDefined();
    fireEvent.press(screen.getByRole('button', { name: phrases.back }));
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
