import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import type { GetMembersResult, RemoveMemberResult } from '@griever/api-client';
import type { MembersView } from '@griever/shared';
import { PeopleHelping } from './PeopleHelping';

const mockGetMembers = jest.fn<(token: string) => Promise<GetMembersResult>>();
const mockRemoveMember = jest.fn<(token: string, id: string) => Promise<RemoveMemberResult>>();
jest.mock('@griever/api-client', () => ({
  ...jest.requireActual<object>('@griever/api-client'),
  getMembers: (token: string) => mockGetMembers(token),
  removeMember: (token: string, id: string) => mockRemoveMember(token, id),
}));

const mockFocus = jest.fn<(node: { props: { children?: unknown } } | null) => void>();
jest.mock('../ui/focusNode', () => ({ focusNode: (node: { props: { children?: unknown } } | null) => mockFocus(node) }));

jest.mock('../lib/features', () => ({ SHARING_ENABLED: true }));
jest.mock('../lib/AccountProvider', () => ({
  useSyncAuth: () => ({ status: 'signed_in', userId: 'u1', getToken: async () => 'tok' }),
}));

type Member = { id: string; name: string | null; email: string };
const sam: Member = { id: 'm1', name: 'Sam Lee', email: 'sam@example.com' };
const pat: Member = { id: 'm2', name: null, email: 'pat@example.com' };
const view = (members: Member[]): MembersView => ({ role: 'owner', members, invites: [] });

const rowButton = (name: string) => screen.getByRole('button', { name: `Remove ${name}` });
const CONFIRM_LINE = "Sam Lee won't see the people you're writing about any more.";

async function renderOwner(members: Member[] = [sam, pat]) {
  mockGetMembers.mockResolvedValue({ ok: true, view: view(members) });
  render(<PeopleHelping sessionEnded={false} />);
  await screen.findByText('People helping you');
  await screen.findByText(members[0].name ?? members[0].email);
}

const lastFocusText = () => mockFocus.mock.calls.at(-1)?.[0]?.props.children;

beforeEach(() => {
  jest.clearAllMocks();
  mockRemoveMember.mockResolvedValue({ ok: true });
});

describe('Remove a helper', () => {
  it('names each row, using the email when there is no name', async () => {
    await renderOwner();
    expect(rowButton('Sam Lee')).toBeTruthy();
    expect(rowButton('pat@example.com')).toBeTruthy();
  });

  it('opens the confirm step in place, makes no call and moves focus into the step', async () => {
    await renderOwner();
    fireEvent.press(rowButton('Sam Lee'));
    expect(screen.getByText(CONFIRM_LINE)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Remove' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Keep' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Remove Sam Lee' })).toBeNull();
    expect(mockRemoveMember).not.toHaveBeenCalled();
    await waitFor(() => expect(lastFocusText()).toBe(CONFIRM_LINE));
  });

  it('Keep closes the step, calls nothing and returns focus to the row button', async () => {
    await renderOwner();
    fireEvent.press(rowButton('Sam Lee'));
    await waitFor(() => expect(lastFocusText()).toBe(CONFIRM_LINE));
    mockFocus.mockClear();
    fireEvent.press(screen.getByRole('button', { name: 'Keep' }));
    expect(screen.queryByText(CONFIRM_LINE)).toBeNull();
    expect(rowButton('Sam Lee')).toBeTruthy();
    await waitFor(() => expect(mockFocus).toHaveBeenCalledTimes(1));
    expect(mockFocus.mock.calls[0][0]).not.toBeNull();
    expect(mockRemoveMember).not.toHaveBeenCalled();
  });

  it('Remove calls removeMember once with the id, announces it and focuses the section heading', async () => {
    await renderOwner();
    mockGetMembers.mockResolvedValue({ ok: true, view: view([pat]) });
    fireEvent.press(rowButton('Sam Lee'));
    fireEvent.press(screen.getByRole('button', { name: 'Remove' }));
    expect(await screen.findByText('Sam Lee has been removed.')).toBeTruthy();
    expect(mockRemoveMember).toHaveBeenCalledTimes(1);
    expect(mockRemoveMember).toHaveBeenCalledWith('tok', 'm1');
    await waitFor(() => expect(lastFocusText()).toBe('People helping you'));
    await waitFor(() => expect(screen.queryByText('Sam Lee')).toBeNull());
  });

  it('shows Removing… and removes once when Remove is pressed twice', async () => {
    await renderOwner();
    let release: (r: RemoveMemberResult) => void = () => undefined;
    mockRemoveMember.mockReturnValue(new Promise((resolve) => (release = resolve)));
    fireEvent.press(rowButton('Sam Lee'));
    fireEvent.press(screen.getByRole('button', { name: 'Remove' }));
    fireEvent.press(screen.getByRole('button', { name: 'Removing…' }));
    expect(screen.getByText('Removing…')).toBeTruthy();
    mockGetMembers.mockResolvedValue({ ok: true, view: view([pat]) });
    await act(async () => release({ ok: true }));
    expect(mockRemoveMember).toHaveBeenCalledTimes(1);
  });

  it('on failure shows the hook message, keeps the member and returns focus to the row button', async () => {
    await renderOwner();
    mockRemoveMember.mockResolvedValue({ ok: false, reason: 'offline' });
    fireEvent.press(rowButton('Sam Lee'));
    await waitFor(() => expect(lastFocusText()).toBe(CONFIRM_LINE));
    mockFocus.mockClear();
    fireEvent.press(screen.getByRole('button', { name: 'Remove' }));
    expect(await screen.findByText('You need a connection to do this. Nothing else is affected.')).toBeTruthy();
    expect(screen.queryByText('Sam Lee has been removed.')).toBeNull();
    expect(rowButton('Sam Lee')).toBeTruthy();
    await waitFor(() => expect(mockFocus).toHaveBeenCalledTimes(1));
    expect(lastFocusText()).not.toBe('People helping you');
  });

  it('shows a member no remove control', async () => {
    mockGetMembers.mockResolvedValue({ ok: true, view: { role: 'member', owner: { id: 'o1', name: 'Anna' } } });
    render(<PeopleHelping sessionEnded={false} />);
    await screen.findByText("You're helping Anna.");
    expect(screen.queryByRole('button', { name: /^Remove/ })).toBeNull();
  });
});
