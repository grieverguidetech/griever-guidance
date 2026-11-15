import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { TextInput } from 'react-native';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import type { CreateInviteResult, GetMembersResult, RevokeInviteResult } from '@griever/api-client';
import type { MembersView } from '@griever/shared';
import { PeopleHelping } from './PeopleHelping';

const mockGetMembers = jest.fn<(token: string) => Promise<GetMembersResult>>();
const mockCreateInvite = jest.fn<(token: string, email: string) => Promise<CreateInviteResult>>();
const mockRevokeInvite = jest.fn<(token: string, id: string) => Promise<RevokeInviteResult>>();
jest.mock('@griever/api-client', () => ({
  ...jest.requireActual<object>('@griever/api-client'),
  getMembers: (token: string) => mockGetMembers(token),
  createInvite: (token: string, email: string) => mockCreateInvite(token, email),
  revokeInvite: (token: string, id: string) => mockRevokeInvite(token, id),
}));

const mockFocus = jest.fn<(node: { props: { children?: unknown } } | null) => void>();
jest.mock('../ui/focusNode', () => ({ focusNode: (node: { props: { children?: unknown } } | null) => mockFocus(node) }));

jest.mock('../lib/features', () => ({ SHARING_ENABLED: true }));
jest.mock('../lib/AccountProvider', () => ({
  useSyncAuth: () => ({ status: 'signed_in', userId: 'u1', getToken: async () => 'tok' }),
}));

const invite = (id: string, email: string) => ({ id, email, expiresAt: '2026-12-05T12:00:00.000Z', createdAt: '2026-11-28T12:00:00.000Z' });
const view = (invites: ReturnType<typeof invite>[]): MembersView => ({ role: 'owner', members: [], invites });

const field = () => screen.getByLabelText('Their email');
const sendButton = () => screen.getByRole('button', { name: 'Send an invitation' });

async function renderOwner(invites: ReturnType<typeof invite>[]) {
  mockGetMembers.mockResolvedValue({ ok: true, view: view(invites) });
  render(<PeopleHelping sessionEnded={false} />);
  await screen.findByText('People helping you');
}

beforeEach(() => {
  jest.clearAllMocks();
  mockCreateInvite.mockResolvedValue({ ok: true, invite: invite('i9', 'kim@example.com') });
  mockRevokeInvite.mockResolvedValue({ ok: true });
});

describe('PeopleHelping: invite by typed email', () => {
  it('sends the normalised email, clears the field, announces it and lists the invite after the reload', async () => {
    await renderOwner([]);
    mockGetMembers.mockResolvedValue({ ok: true, view: view([invite('i9', 'kim@example.com')]) });
    fireEvent.changeText(field(), '  Kim@Example.com ');
    fireEvent.press(sendButton());
    expect(await screen.findByText('Invitation sent.')).toBeTruthy();
    expect(mockCreateInvite).toHaveBeenCalledWith('tok', 'kim@example.com');
    expect(field().props.value).toBe('');
    expect(await screen.findByText('kim@example.com')).toBeTruthy();
    expect(screen.getByText('Invited')).toBeTruthy();
  });

  it('configures the field for a typed email and never reads contacts', async () => {
    await renderOwner([]);
    expect(field().props).toMatchObject({ keyboardType: 'email-address', autoCapitalize: 'none', autoComplete: 'off', textContentType: 'none' });
  });

  it('rejects a bad email with no request, shows the line under the field and focuses it', async () => {
    await renderOwner([]);
    const focus = jest.spyOn(screen.UNSAFE_getByType(TextInput).instance as { focus: () => void }, 'focus');
    fireEvent.changeText(field(), 'not an email');
    fireEvent.press(sendButton());
    expect(screen.getByText("That email doesn't look right.")).toBeTruthy();
    expect(mockCreateInvite).not.toHaveBeenCalled();
    expect(focus).toHaveBeenCalled();
  });

  it('sends once when the button is tapped twice, and shows Sending… meanwhile', async () => {
    await renderOwner([]);
    let release: (r: CreateInviteResult) => void = () => undefined;
    mockCreateInvite.mockReturnValue(new Promise((resolve) => (release = resolve)));
    fireEvent.changeText(field(), 'kim@example.com');
    fireEvent.press(sendButton());
    fireEvent.press(screen.getByRole('button', { name: 'Sending…' }));
    expect(screen.getByText('Sending…')).toBeTruthy();
    await act(async () => release({ ok: true, invite: invite('i9', 'kim@example.com') }));
    await waitFor(() => expect(screen.getByText('Send an invitation')).toBeTruthy());
    expect(mockCreateInvite).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['offline', 'You need a connection to do this. Nothing else is affected.'],
    ['conflict', 'That person is already invited or already helping.'],
  ] as const)('shows the hook message as is on %s and keeps the typed email', async (reason, text) => {
    await renderOwner([]);
    mockCreateInvite.mockResolvedValue({ ok: false, reason });
    fireEvent.changeText(field(), 'kim@example.com');
    fireEvent.press(sendButton());
    expect(await screen.findByText(text)).toBeTruthy();
    expect(screen.queryByText('Invitation sent.')).toBeNull();
    expect(field().props.value).toBe('kim@example.com');
  });
});

describe('PeopleHelping: cancel an invitation', () => {
  it('revokes by id, announces it and focuses the Invited heading while others remain', async () => {
    await renderOwner([invite('i1', 'kim@example.com'), invite('i2', 'lee@example.com')]);
    mockGetMembers.mockResolvedValue({ ok: true, view: view([invite('i2', 'lee@example.com')]) });
    fireEvent.press(screen.getByLabelText('Cancel this invitation for kim@example.com'));
    expect(await screen.findByText('Invitation cancelled.')).toBeTruthy();
    expect(mockRevokeInvite).toHaveBeenCalledWith('tok', 'i1');
    await waitFor(() => expect(mockFocus).toHaveBeenCalled());
    expect(mockFocus.mock.calls.at(-1)?.[0]?.props.children).toBe('Invited');
  });

  it('focuses the section heading when no invitation is left', async () => {
    await renderOwner([invite('i1', 'kim@example.com')]);
    mockGetMembers.mockResolvedValue({ ok: true, view: view([]) });
    fireEvent.press(screen.getByLabelText('Cancel this invitation for kim@example.com'));
    await waitFor(() => expect(mockFocus).toHaveBeenCalled());
    expect(mockFocus.mock.calls.at(-1)?.[0]?.props.children).toBe('People helping you');
  });

  it('shows the hook message and moves no focus when the cancel fails', async () => {
    await renderOwner([invite('i1', 'kim@example.com')]);
    mockRevokeInvite.mockResolvedValue({ ok: false, reason: 'offline' });
    fireEvent.press(screen.getByLabelText('Cancel this invitation for kim@example.com'));
    expect(await screen.findByText('You need a connection to do this. Nothing else is affected.')).toBeTruthy();
    expect(mockFocus).not.toHaveBeenCalled();
    expect(screen.queryByText('Invitation cancelled.')).toBeNull();
  });
});

describe('PeopleHelping: contacts', () => {
  it('does not import expo-contacts', () => {
    const source = readFileSync(join(__dirname, 'PeopleHelping.tsx'), 'utf8');
    expect(source).not.toMatch(/expo-contacts/);
  });
});
