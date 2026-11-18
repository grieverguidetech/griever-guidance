import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { AccessibilityInfo, Platform } from 'react-native';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import type { GetMembersResult, LeaveMembershipResult } from '@griever/api-client';
import type { MembersView } from '@griever/shared';
import { membersErrorMessage } from '@griever/hooks';
import { onLeftFamily } from '../lib/leftFamily';
import { PeopleHelping } from './PeopleHelping';

const mockGetMembers = jest.fn<(token: string) => Promise<GetMembersResult>>();
const mockLeave = jest.fn<(token: string) => Promise<LeaveMembershipResult>>();
jest.mock('@griever/api-client', () => ({
  ...jest.requireActual<object>('@griever/api-client'),
  getMembers: (token: string) => mockGetMembers(token),
  leaveMembership: (token: string) => mockLeave(token),
}));

const mockFocus = jest.fn<(node: { props: { children?: unknown } } | null) => void>();
jest.mock('../ui/focusNode', () => ({ focusNode: (node: { props: { children?: unknown } } | null) => mockFocus(node) }));

jest.mock('../lib/features', () => ({ SHARING_ENABLED: true }));
jest.mock('../lib/AccountProvider', () => ({
  useSyncAuth: () => ({ status: 'signed_in', userId: 'u1', getToken: async () => 'tok' }),
}));

const member: MembersView = { role: 'member', owner: { id: 'o1', name: 'Anna' } };
const emptyOwner: MembersView = { role: 'owner', members: [], invites: [] };

const CONFIRM =
  "You'll stop seeing the people Anna shares with you, and anything you started writing for them will be removed from this device. You can then add someone yourself.";
const opener = () => screen.getByRole('button', { name: 'Stop helping Anna' });
const lastFocusText = () => mockFocus.mock.calls.at(-1)?.[0]?.props.children;
// The text lines drawn inside the last node that got focus: for a button, its label.
const lastFocusLines = () => {
  const node = mockFocus.mock.calls.at(-1)?.[0];
  const found = screen.UNSAFE_root.findAll((n: { instance: unknown }) => n.instance === node)[0];
  return found
    ? found.findAll((n: { type: unknown; props: Record<string, unknown> }) => typeof n.type === 'string' && typeof n.props.children === 'string').map((n: { props: Record<string, unknown> }) => n.props.children)
    : [];
};
const tick = () => act(async () => new Promise((resolve) => setTimeout(resolve, 5)));

const calls: string[] = [];
const left = jest.fn<(userId: string) => void>((): void => {
  calls.push('left');
});
let reloadProfile: jest.Mock<() => void>;
const announced = jest.fn<(message: string, options: { queue: boolean }) => void>();
let stopListening: () => void = () => undefined;

async function renderMember(afterLeave: GetMembersResult = { ok: true, view: emptyOwner }) {
  mockGetMembers.mockResolvedValueOnce({ ok: true, view: member });
  mockGetMembers.mockResolvedValue(afterLeave);
  render(<PeopleHelping sessionEnded={false} reloadProfile={reloadProfile} />);
  await screen.findByText("You're helping Anna.");
}

beforeEach(() => {
  jest.clearAllMocks();
  mockLeave.mockResolvedValue({ ok: true });
  calls.length = 0;
  reloadProfile = jest.fn(() => {
    calls.push('reload');
  });
  Platform.OS = 'ios';
  AccessibilityInfo.announceForAccessibilityWithOptions = announced as never;
  stopListening = onLeftFamily(left);
});

afterEach(() => stopListening());

describe('PeopleHelping: stop helping (#224)', () => {
  it('shows a member the Stop helping button, with no confirm step until it is pressed', async () => {
    await renderMember();
    expect(opener()).toBeTruthy();
    expect(screen.queryByText(CONFIRM)).toBeNull();
  });

  it('shows an owner no stop-helping button', async () => {
    mockGetMembers.mockResolvedValue({ ok: true, view: emptyOwner });
    render(<PeopleHelping sessionEnded={false} />);
    await screen.findByText('People helping you');
    expect(screen.queryByText(/Stop helping/)).toBeNull();
  });

  it('opens the step with the exact words, no exclamation mark, and focuses its heading', async () => {
    await renderMember();
    fireEvent.press(opener());
    expect(screen.getByText('Stop helping Anna?')).toBeTruthy();
    expect(screen.getByText(CONFIRM)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Stop helping' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Keep helping' })).toBeTruthy();
    expect(CONFIRM).not.toContain('!');
    await waitFor(() => expect(lastFocusText()).toBe('Stop helping Anna?'));
    expect(mockLeave).not.toHaveBeenCalled();
  });

  it('Keep closes the step, calls nothing and returns focus to the button', async () => {
    await renderMember();
    fireEvent.press(opener());
    await tick();
    mockFocus.mockClear();
    fireEvent.press(screen.getByRole('button', { name: 'Keep helping' }));
    expect(screen.queryByText(CONFIRM)).toBeNull();
    await waitFor(() => expect(mockFocus).toHaveBeenCalled());
    expect(lastFocusLines()).toEqual(['Stop helping Anna']);
    expect(mockLeave).not.toHaveBeenCalled();
  });

  it('a double tap leaves once and shows Stopping… meanwhile', async () => {
    await renderMember();
    fireEvent.press(opener());
    let finish: (r: LeaveMembershipResult) => void = () => undefined;
    mockLeave.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    const stop = screen.getByRole('button', { name: 'Stop helping' });
    fireEvent.press(stop);
    fireEvent.press(stop);
    expect(screen.getByText('Stopping…')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Stopping…' }).props.accessibilityState).toMatchObject({ busy: true, disabled: true });
    expect(screen.getByRole('button', { name: 'Keep helping' }).props.accessibilityState).toMatchObject({ disabled: true });
    await waitFor(() => expect(mockLeave).toHaveBeenCalledTimes(1));
    await tick();
    expect(mockLeave).toHaveBeenCalledTimes(1);
    await act(async () => finish({ ok: true }));
  });

  it('on success: owner view, announcement line, focus on the section heading, shared people dropped, pull and profile reload', async () => {
    await renderMember();
    fireEvent.press(opener());
    fireEvent.press(screen.getByRole('button', { name: 'Stop helping' }));
    expect(await screen.findByText("You've stopped helping Anna.")).toBeTruthy();
    expect(mockLeave).toHaveBeenCalledWith('tok');
    expect(screen.queryByText("You're helping Anna.")).toBeNull();
    expect(left).toHaveBeenCalledTimes(1);
    expect(left).toHaveBeenCalledWith('u1');
    expect(reloadProfile).toHaveBeenCalledTimes(1);
    // The shared people go from the device before the profile reload.
    expect(calls).toEqual(['left', 'reload']);
    expect(announced).toHaveBeenCalledWith("You've stopped helping Anna.", { queue: true });
    await waitFor(() => expect(lastFocusText()).toBe('People helping you'));
  });

  it('treats not_a_member as left, and still drops the shared people when the reload fails', async () => {
    mockLeave.mockResolvedValue({ ok: false, reason: 'not_a_member' });
    await renderMember({ ok: false, reason: 'unusable' });
    fireEvent.press(opener());
    fireEvent.press(screen.getByRole('button', { name: 'Stop helping' }));
    expect(await screen.findByText(/You've stopped helping Anna\./)).toBeTruthy();
    expect(left).toHaveBeenCalledWith('u1');
    expect(screen.queryByText("You're helping Anna.")).toBeNull();
  });

  it('offline: says nothing changed, keeps the step open and drops nothing', async () => {
    mockLeave.mockResolvedValue({ ok: false, reason: 'offline' });
    await renderMember();
    fireEvent.press(opener());
    fireEvent.press(screen.getByRole('button', { name: 'Stop helping' }));
    expect(await screen.findByText('You need a connection to stop helping. Nothing has changed.')).toBeTruthy();
    expect(announced).toHaveBeenCalledWith('You need a connection to stop helping. Nothing has changed.', { queue: true });
    expect(screen.getByText(CONFIRM)).toBeTruthy();
    expect(screen.getByText("You're helping Anna.")).toBeTruthy();
    expect(left).not.toHaveBeenCalled();
    expect(reloadProfile).not.toHaveBeenCalled();
  });

  it('another failure keeps everything and drops nothing', async () => {
    mockLeave.mockResolvedValue({ ok: false, reason: 'unusable' });
    await renderMember();
    fireEvent.press(opener());
    fireEvent.press(screen.getByRole('button', { name: 'Stop helping' }));
    await waitFor(() => expect(mockLeave).toHaveBeenCalledTimes(1));
    await tick();
    expect(screen.getByText(CONFIRM)).toBeTruthy();
    expect(left).not.toHaveBeenCalled();
  });

  it('Keep clears the offline line, and a later different message from the hook shows as it is', async () => {
    mockLeave.mockResolvedValue({ ok: false, reason: 'offline' });
    await renderMember();
    fireEvent.press(opener());
    fireEvent.press(screen.getByRole('button', { name: 'Stop helping' }));
    await screen.findByText('You need a connection to stop helping. Nothing has changed.');
    fireEvent.press(screen.getByRole('button', { name: 'Keep helping' }));
    await waitFor(() => expect(screen.queryByText('You need a connection to stop helping. Nothing has changed.')).toBeNull());
    expect(screen.queryByText(/You need a connection/)).toBeNull();

    mockLeave.mockResolvedValue({ ok: false, reason: 'unusable' });
    fireEvent.press(opener());
    fireEvent.press(screen.getByRole('button', { name: 'Stop helping' }));
    await waitFor(() => expect(mockLeave).toHaveBeenCalledTimes(2));
    await tick();
    expect(screen.queryByText('You need a connection to stop helping. Nothing has changed.')).toBeNull();
    expect(screen.getByText(membersErrorMessage('unusable', 'leave'))).toBeTruthy();
  });
});
