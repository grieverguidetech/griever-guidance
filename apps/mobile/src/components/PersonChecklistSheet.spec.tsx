import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { AccessibilityInfo, Modal } from 'react-native';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { screenCopy } from '@griever/copy';
import { CHECKLIST_PHASES, TIME_PHASE_KEYS } from '@griever/shared';
import type { ChecklistFields, ChecklistItemState } from '@griever/shared';
import { PersonChecklistSheet } from './PersonChecklistSheet';

// Jest has no native view tree, so findNodeHandle returns null. A fake handle lets the test see the focus call.
// This path is specific to react-native 0.81 (Expo SDK 54). Re-check it when react-native is upgraded.
jest.mock('react-native/Libraries/ReactNative/RendererProxy', () => ({
  ...jest.requireActual<object>('react-native/Libraries/ReactNative/RendererProxy'),
  findNodeHandle: () => 1,
}));

const phrases = screenCopy('cmsChecklist');
const copy = screenCopy('phoneChecklist');
const KEY = 'gg.checklist.v1';

const itemsOf = (phaseKey: string) => CHECKLIST_PHASES.find((phase) => phase.key === phaseKey)?.itemIds ?? [];
/** Every item of the given phases set to one state. */
const tick = (phaseKeys: string[], state: ChecklistItemState = 'done'): ChecklistFields['checklist'] =>
  Object.fromEntries(phaseKeys.flatMap(itemsOf).map((id) => [id, state]));

const setup = async (checklist: ChecklistFields['checklist'] = {}, onOpenGroup = jest.fn()) => {
  render(<PersonChecklistSheet visible onClose={jest.fn()} checklist={checklist} onOpenGroup={onOpenGroup} />);
  // Let the saved Gather ticks load.
  await act(async () => {});
  return onOpenGroup;
};
const doneGroup = (label: string) => screen.queryByRole('button', { name: `${label}. Done` });

describe('PersonChecklistSheet (#696)', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    await AsyncStorage.removeItem(KEY);
  });
  afterEach(async () => {
    jest.restoreAllMocks();
    await AsyncStorage.removeItem(KEY);
  });

  it('lists the four time phases in the real order, then Gather when you can', async () => {
    await setup();
    const labels = screen.getAllByRole('button').map((button) => button.props.accessibilityLabel).filter(Boolean);
    const expected = [...TIME_PHASE_KEYS.map((key) => phrases.phases[key]), 'Gather when you can'];
    expect(labels.filter((label: string) => expected.includes(label))).toEqual(expected);
    expect(TIME_PHASE_KEYS).toEqual(['right-away', 'first-days', 'first-weeks', 'first-months']);
    expect(phrases.gatherHeading).toBe('Gather when you can');
  });

  it('says the ticks stay on this phone and shows no counts', async () => {
    await setup(tick(['right-away']));
    expect(screen.getByText(copy.staysOnPhone)).toBeTruthy();
    expect(screen.queryByText(/\d+\s*(of|\/)\s*\d+/)).toBeNull();
    expect(screen.queryByText(/%/)).toBeNull();
    expect(screen.queryByText(/!/)).toBeNull();
  });

  it('marks no group Done when nothing is ticked', async () => {
    await setup();
    expect(screen.queryByText(phrases.done)).toBeNull();
  });

  it('marks a phase Done when every item is ticked, in the label and on screen', async () => {
    await setup(tick(['right-away']));
    expect(doneGroup(phrases.phases['right-away'])).toBeTruthy();
    expect(screen.getAllByText(phrases.done)).toHaveLength(1);
    expect(doneGroup(phrases.phases['first-days'])).toBeNull();
  });

  it("counts Doesn't apply as handled", async () => {
    await setup(tick(['first-days'], 'not_applicable'));
    expect(doneGroup(phrases.phases['first-days'])).toBeTruthy();
  });

  it('does not mark a phase Done while one item is still open', async () => {
    const [, ...rest] = itemsOf('right-away');
    await setup(Object.fromEntries(rest.map((id) => [id, 'done'])));
    expect(doneGroup(phrases.phases['right-away'])).toBeNull();
  });

  it('marks Gather Done only when all five saved Gather items are ticked', async () => {
    await AsyncStorage.setItem(KEY, JSON.stringify(['will', 'plans', 'ssn', 'insurance']));
    await setup();
    expect(doneGroup('Gather when you can')).toBeNull();
    await AsyncStorage.setItem(KEY, JSON.stringify(['will', 'plans', 'ssn', 'insurance', 'military']));
    await setup();
    expect(doneGroup('Gather when you can')).toBeTruthy();
  });

  it('treats a broken saved value as nothing ticked', async () => {
    await AsyncStorage.setItem(KEY, '{not json');
    await setup();
    expect(doneGroup('Gather when you can')).toBeNull();
  });

  it('tells the caller which group was tapped', async () => {
    const onOpenGroup = await setup();
    fireEvent.press(screen.getByRole('button', { name: phrases.phases['first-weeks'] }));
    fireEvent.press(screen.getByRole('button', { name: 'Gather when you can' }));
    expect(onOpenGroup.mock.calls).toEqual([['first-weeks'], ['gather']]);
  });

  it('has a Close button, and screen-reader focus goes to the title when the sheet shows', async () => {
    const focus = jest.spyOn(AccessibilityInfo, 'setAccessibilityFocus').mockImplementation(() => undefined);
    const onClose = jest.fn();
    render(<PersonChecklistSheet visible onClose={onClose} checklist={{}} onOpenGroup={jest.fn()} />);
    await act(async () => {});
    expect(screen.getByText(copy.title)).toBeTruthy();
    act(() => screen.UNSAFE_getByType(Modal).props.onShow());
    expect(focus).toHaveBeenCalledTimes(1);
    fireEvent.press(screen.getByRole('button', { name: copy.close }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
