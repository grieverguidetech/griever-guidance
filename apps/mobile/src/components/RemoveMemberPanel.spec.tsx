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
// The text lines drawn inside the last node that got focus: for a button, its label.
const lastFocusLines = () => {
  const node = mockFocus.mock.calls.at(-1)?.[0];
  const found = screen.UNSAFE_root.findAll((n: { instance: unknown }) => n.instance === node)[0];
  return found
    ? found.findAll((n: { type: unknown; props: Record<string, unknown> }) => typeof n.type === 'string' && typeof n.props.children === 'string').map((n: { props: Record<string, unknown> }) => n.props.children)
    : [];
};

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
    expect(screen.getByRole('button', { name: 'Remove Sam Lee' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Keep Sam Lee' })).toBeTruthy();
    expect(screen.queryByText('Remove Sam Lee')).toBeNull();
    expect(mockRemoveMember).not.toHaveBeenCalled();
    await waitFor(() => expect(lastFocusText()).toBe(CONFIRM_LINE));
  });

  it('Keep closes the step, calls nothing and returns focus to the row button', async () => {
    await renderOwner();
    fireEvent.press(rowButton('Sam Lee'));
    await waitFor(() => expect(lastFocusText()).toBe(CONFIRM_LINE));
    mockFocus.mockClear();
    fireEvent.press(screen.getByRole('button', { name: 'Keep Sam Lee' }));
    expect(screen.queryByText(CONFIRM_LINE)).toBeNull();
    expect(rowButton('Sam Lee')).toBeTruthy();
    await waitFor(() => expect(mockFocus).toHaveBeenCalledTimes(1));
    expect(lastFocusLines()).toEqual(['Remove Sam Lee']);
    expect(mockRemoveMember).not.toHaveBeenCalled();
  });

  it('Remove calls removeMember once with the id, announces it and focuses the section heading', async () => {
    await renderOwner();
    mockGetMembers.mockResolvedValue({ ok: true, view: view([pat]) });
    fireEvent.press(rowButton('Sam Lee'));
    fireEvent.press(screen.getByRole('button', { name: 'Remove Sam Lee' }));
    expect(await screen.findByText('Sam Lee has been removed.')).toBeTruthy();
    expect(mockRemoveMember).toHaveBeenCalledTimes(1);
    expect(mockRemoveMember).toHaveBeenCalledWith('tok', 'm1');
    await waitFor(() => expect(lastFocusText()).toBe('Helping you'));
    await waitFor(() => expect(screen.queryByText('Sam Lee')).toBeNull());
  });

  it('shows Removing… and removes once when Remove is pressed twice', async () => {
    await renderOwner();
    let release: (r: RemoveMemberResult) => void = () => undefined;
    mockRemoveMember.mockReturnValue(new Promise((resolve) => (release = resolve)));
    fireEvent.press(rowButton('Sam Lee'));
    fireEvent.press(screen.getByRole('button', { name: 'Remove Sam Lee' }));
    fireEvent.press(screen.getByRole('button', { name: 'Remove Sam Lee' }));
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
    fireEvent.press(screen.getByRole('button', { name: 'Remove Sam Lee' }));
    expect(await screen.findByText('You need a connection to do this. Nothing else is affected.')).toBeTruthy();
    expect(screen.queryByText('Sam Lee has been removed.')).toBeNull();
    expect(rowButton('Sam Lee')).toBeTruthy();
    await waitFor(() => expect(mockFocus).toHaveBeenCalledTimes(1));
    expect(lastFocusLines()).toEqual(['Remove Sam Lee']);
  });

  it('focuses the section heading when the last helper is removed', async () => {
    await renderOwner([sam]);
    mockGetMembers.mockResolvedValue({ ok: true, view: view([]) });
    fireEvent.press(rowButton('Sam Lee'));
    fireEvent.press(screen.getByRole('button', { name: 'Remove Sam Lee' }));
    await screen.findByText('Sam Lee has been removed.');
    await waitFor(() => expect(lastFocusText()).toBe('People helping you'));
    expect(screen.queryByText('Helping you')).toBeNull();
  });

  it('hides the removed row, removes once and focuses the heading when the reload after it fails', async () => {
    await renderOwner();
    mockGetMembers.mockResolvedValue({ ok: false, reason: 'offline' });
    fireEvent.press(rowButton('Sam Lee'));
    fireEvent.press(screen.getByRole('button', { name: 'Remove Sam Lee' }));
    expect(await screen.findByText(/Sam Lee has been removed\./)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Remove Sam Lee' })).toBeNull();
    expect(screen.queryByText('Sam Lee')).toBeNull();
    expect(screen.getByText('pat@example.com')).toBeTruthy();
    expect(mockRemoveMember).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(lastFocusText()).toBe('Helping you'));
  });

  it('keeps one confirm step open at a time and does not move focus to the row it closes', async () => {
    await renderOwner();
    fireEvent.press(rowButton('Sam Lee'));
    await waitFor(() => expect(lastFocusText()).toBe(CONFIRM_LINE));
    mockFocus.mockClear();
    fireEvent.press(rowButton('pat@example.com'));
    expect(screen.getAllByText(/won't see the people you're writing about/)).toHaveLength(1);
    expect(screen.getByText("pat@example.com won't see the people you're writing about any more.")).toBeTruthy();
    expect(rowButton('Sam Lee')).toBeTruthy();
    await waitFor(() => expect(lastFocusText()).toBe("pat@example.com won't see the people you're writing about any more."));
    expect(mockFocus).toHaveBeenCalledTimes(1);
  });

  it('names the step buttons with the person', async () => {
    await renderOwner();
    fireEvent.press(rowButton('pat@example.com'));
    expect(screen.getByRole('button', { name: 'Remove pat@example.com' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Keep pat@example.com' })).toBeTruthy();
  });

  it('ignores Keep while the removal runs', async () => {
    await renderOwner();
    let release: (r: RemoveMemberResult) => void = () => undefined;
    mockRemoveMember.mockReturnValue(new Promise((resolve) => (release = resolve)));
    fireEvent.press(rowButton('Sam Lee'));
    fireEvent.press(screen.getByRole('button', { name: 'Remove Sam Lee' }));
    fireEvent.press(screen.getByRole('button', { name: 'Keep Sam Lee' }));
    expect(screen.getByText(CONFIRM_LINE)).toBeTruthy();
    mockGetMembers.mockResolvedValue({ ok: true, view: view([pat]) });
    await act(async () => release({ ok: true }));
    expect(mockRemoveMember).toHaveBeenCalledTimes(1);
  });

  it('shows a member no remove control', async () => {
    mockGetMembers.mockResolvedValue({ ok: true, view: { role: 'member', owner: { id: 'o1', name: 'Anna' } } });
    render(<PeopleHelping sessionEnded={false} />);
    await screen.findByText("You're helping Anna.");
    expect(screen.queryByRole('button', { name: /^Remove/ })).toBeNull();
  });
});
