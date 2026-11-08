import { describe, expect, it, jest } from '@jest/globals';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { AccessibilityInfo } from 'react-native';
import { screenCopy } from '@griever/copy';
import { DeleteAccountPanel } from './DeleteAccountPanel';
import type { DeleteOutcome } from './DeleteAccountPanel';

// Jest has no native view tree, so findNodeHandle returns null; focus needs a handle. Same replacement as ui/screens/Account.spec.tsx.
jest.mock('react-native/Libraries/ReactNative/RendererProxy', () => ({
  ...jest.requireActual<object>('react-native/Libraries/ReactNative/RendererProxy'),
  findNodeHandle: () => 1,
}));

const copy = { ...screenCopy('account'), ...screenCopy('phoneAccount') };
/** Focus moves a tick after the swap draws (and on the next frame after a failure). */
const nextTick = () => act(async () => new Promise<void>((resolve) => setTimeout(resolve, 20)));

function setup(onDelete: () => Promise<DeleteOutcome> = async () => 'deleted') {
  const handler = jest.fn(onDelete);
  render(<DeleteAccountPanel copy={copy} onDelete={handler} />);
  return handler;
}
const open = () => fireEvent.press(screen.getByRole('button', { name: copy.deleteOpen }));
const yes = () => fireEvent.press(screen.getByRole('button', { name: copy.deleteConfirmAction }));

describe('DeleteAccountPanel', () => {
  it('shows the hint and one button, and no confirm step, until the first press', () => {
    setup();
    // The words are on screen but hidden from the screen reader, which reads them as the button's hint.
    expect(screen.getByText(copy.deleteHint, { includeHiddenElements: true })).toBeTruthy();
    expect(screen.queryByText(copy.deleteHint)).toBeNull();
    expect(screen.queryByText(copy.deleteConfirmHeading)).toBeNull();
    expect(screen.queryByRole('button', { name: copy.deleteConfirmAction })).toBeNull();
  });

  it('deletes nothing when the first button is pressed', () => {
    const onDelete = setup();
    open();
    expect(onDelete).not.toHaveBeenCalled();
  });

  it('opens the confirm step in place and moves screen-reader focus to its heading', async () => {
    const focus = jest.spyOn(AccessibilityInfo, 'setAccessibilityFocus').mockImplementation(() => undefined);
    // The spy can be the same function other tests already called, so count from here.
    focus.mockClear();
    setup();
    open();
    expect(screen.getByRole('heading', { name: copy.deleteConfirmHeading })).toBeTruthy();
    expect(screen.getByText(copy.deleteConfirmBody)).toBeTruthy();
    expect(screen.getByRole('button', { name: copy.deleteCancel })).toBeTruthy();
    await nextTick();
    expect(focus).toHaveBeenCalledTimes(1);
    focus.mockRestore();
  });

  it('Cancel goes back to the first button and returns focus to it, with nothing deleted', async () => {
    const focus = jest.spyOn(AccessibilityInfo, 'setAccessibilityFocus').mockImplementation(() => undefined);
    // The spy can be the same function other tests already called, so count from here.
    focus.mockClear();
    const onDelete = setup();
    open();
    await nextTick();
    fireEvent.press(screen.getByRole('button', { name: copy.deleteCancel }));
    expect(screen.getByRole('button', { name: copy.deleteOpen })).toBeTruthy();
    await nextTick();
    expect(screen.queryByText(copy.deleteConfirmHeading)).toBeNull();
    expect(onDelete).not.toHaveBeenCalled();
    expect(focus).toHaveBeenCalledTimes(2);
    focus.mockRestore();
  });

  it('while deleting: says so, marks both buttons disabled, and ignores a second press', async () => {
    let finish: (outcome: DeleteOutcome) => void = () => undefined;
    const onDelete = setup(() => new Promise<DeleteOutcome>((resolve) => { finish = resolve; }));
    open();
    yes();
    yes();
    fireEvent.press(screen.getByRole('button', { name: copy.deleteCancel }));
    expect(onDelete).toHaveBeenCalledTimes(1);
    expect(screen.getByText(copy.deleting)).toBeTruthy();
    expect(screen.getByRole('button', { name: copy.deleteCancel }).props.accessibilityState?.disabled).toBe(true);
    expect(screen.getByRole('button', { name: copy.deleteConfirmAction }).props.accessibilityState?.disabled).toBe(true);
    expect(screen.getByText(copy.deleteConfirmHeading)).toBeTruthy();
    await act(async () => finish('deleted'));
  });

  it('reads the hint with the first button, so the explanation is not only on screen', () => {
    setup();
    expect(screen.getByRole('button', { name: copy.deleteOpen }).props.accessibilityHint).toBe(copy.deleteHint);
  });

  it('a closed verify step says the account was not deleted, keeps the confirm step and puts focus back on its heading', async () => {
    const focus = jest.spyOn(AccessibilityInfo, 'setAccessibilityFocus').mockImplementation(() => undefined);
    setup(async () => 'cancelled');
    open();
    await nextTick();
    focus.mockClear();
    await act(async () => yes());
    await nextTick();
    expect(focus).toHaveBeenCalledTimes(1);
    focus.mockRestore();
    expect(screen.getByText(copy.deleteCancelled)).toBeTruthy();
    expect(screen.getByText(copy.deleteConfirmHeading)).toBeTruthy();
    expect(screen.queryByText(copy.deleting)).toBeNull();
  });

  it('a delete that needs a fresh sign-in says to sign out, sign back in and try again', async () => {
    setup(async () => 'needsSignIn');
    open();
    await act(async () => yes());
    expect(screen.getByText(copy.deleteNeedsSignIn)).toBeTruthy();
    expect(screen.getByText(copy.deleteConfirmHeading)).toBeTruthy();
  });

  it('any other failure says so calmly, and the person can try again', async () => {
    const onDelete = setup(jest.fn<() => Promise<DeleteOutcome>>().mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce('deleted') as () => Promise<DeleteOutcome>);
    open();
    await act(async () => yes());
    expect(screen.getByText(copy.deleteFailed)).toBeTruthy();
    await act(async () => yes());
    expect(onDelete).toHaveBeenCalledTimes(2);
    expect(screen.queryByText(copy.deleteFailed)).toBeNull();
  });
});
