import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { MembersView } from '@griever/shared';
import { formatDate } from '../lib/format';
import { PeopleHelping } from './PeopleHelping';

const owner: MembersView = {
  role: 'owner',
  members: [
    { id: 'm1', name: 'Sam Lee', email: 'sam@example.com' },
    { id: 'm2', name: null, email: 'noname@example.com' },
  ],
  invites: [{ id: 'i1', email: 'pending@example.com', createdAt: '2026-10-01T00:00:00Z', expiresAt: '2026-10-20T12:00:00Z' }],
};

function setup(over: Partial<React.ComponentProps<typeof PeopleHelping>> = {}) {
  const props = {
    view: owner,
    status: 'ready' as const,
    message: null,
    onInvite: vi.fn(async () => true),
    onRevoke: vi.fn(async () => true),
    ...over,
  };
  render(<PeopleHelping {...props} />);
  return props;
}

describe('PeopleHelping as an owner', () => {
  it('shows the heading, the line, the labelled email field and no contact picker', () => {
    setup();
    expect(screen.getByRole('heading', { name: 'People helping you' })).toBeInTheDocument();
    expect(
      screen.getByText("They can see the people you're writing about and send their own messages from their own phone."),
    ).toBeInTheDocument();
    const field = screen.getByLabelText('Their email');
    expect(field).toHaveAttribute('type', 'email');
    expect(field).toHaveAttribute('autocomplete', 'off');
    expect(screen.queryByRole('button', { name: /contact/i })).not.toBeInTheDocument();
  });

  it('lists members by name, else email, and open invitations with their date', () => {
    setup();
    expect(screen.getByText('Sam Lee')).toBeInTheDocument();
    expect(screen.getByText('noname@example.com')).toBeInTheDocument();
    expect(screen.getByText('pending@example.com')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 3, name: 'Helping you' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 3, name: 'Invited' })).toBeInTheDocument();
    expect(screen.getByText(`Invited · link works until ${formatDate('2026-10-20T12:00:00Z')}`)).toBeInTheDocument();
  });

  it('sends a trimmed, lower-cased email and announces the result politely', async () => {
    const user = userEvent.setup();
    const { onInvite } = setup();
    await user.type(screen.getByLabelText('Their email'), '  New@Example.com ');
    await user.click(screen.getByRole('button', { name: 'Send an invitation' }));
    expect(onInvite).toHaveBeenCalledWith('new@example.com');
    const live = screen.getByRole('status');
    expect(live).toHaveAttribute('aria-live', 'polite');
    await waitFor(() => expect(live).toHaveTextContent('Invitation sent.'));
    expect(screen.getByLabelText('Their email')).toHaveValue('');
  });

  it('links an invalid-email message to the field and keeps focus there', async () => {
    const user = userEvent.setup();
    const { onInvite } = setup();
    const field = screen.getByLabelText('Their email');
    await user.type(field, 'not-an-email');
    await user.click(screen.getByRole('button', { name: 'Send an invitation' }));
    expect(onInvite).not.toHaveBeenCalled();
    const error = screen.getByText("That email doesn't look right.");
    expect(field).toHaveAttribute('aria-describedby', error.id);
    expect(field).toHaveAccessibleDescription("That email doesn't look right.");
    expect(screen.getByRole('status')).toBeEmptyDOMElement();
    expect(field).toHaveFocus();
    expect(field).toHaveValue('not-an-email');
  });

  it('shows the hook message in the live region and keeps what was typed when the invite fails', async () => {
    const user = userEvent.setup();
    setup({ message: 'You need a connection to do this.', onInvite: vi.fn(async () => false) });
    await user.type(screen.getByLabelText('Their email'), 'a@b.co');
    await user.click(screen.getByRole('button', { name: 'Send an invitation' }));
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('You need a connection to do this.'));
    expect(screen.getByLabelText('Their email')).toHaveValue('a@b.co');
  });

  it('cancels an invitation, announces it and moves focus to the Invited heading, not the field', async () => {
    const user = userEvent.setup();
    const { onRevoke } = setup();
    const field = screen.getByLabelText('Their email');
    await user.type(field, 'bad');
    await user.click(screen.getByRole('button', { name: 'Send an invitation' }));
    await user.click(screen.getByRole('button', { name: /Cancel this invitation/ }));
    expect(onRevoke).toHaveBeenCalledWith('i1');
    expect(await screen.findByText('Invitation cancelled.')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 3, name: 'Invited' })).toHaveFocus();
    expect(field).not.toHaveAttribute('aria-invalid');
    expect(field).not.toHaveAccessibleDescription('Invitation cancelled.');
  });

  it('moves focus to the section heading when no invitations are left', async () => {
    const user = userEvent.setup();
    const onRevoke = vi.fn(async () => true);
    const props = { status: 'ready' as const, message: null, onInvite: vi.fn(), onRevoke };
    const { rerender } = render(<PeopleHelping view={owner} {...props} />);
    await user.click(screen.getByRole('button', { name: /Cancel this invitation/ }));
    rerender(<PeopleHelping view={{ ...owner, invites: [] }} {...props} />);
    expect(screen.getByRole('heading', { level: 2, name: 'People helping you' })).toHaveFocus();
  });

  it('sends one revoke for a double tap', async () => {
    const user = userEvent.setup();
    let finish: (ok: boolean) => void = () => undefined;
    const onRevoke = vi.fn(() => new Promise<boolean>((resolve) => (finish = resolve)));
    setup({ onRevoke });
    const button = screen.getByRole('button', { name: /Cancel this invitation/ });
    await user.click(button);
    await user.click(button);
    expect(onRevoke).toHaveBeenCalledTimes(1);
    finish(true);
    await screen.findByText('Invitation cancelled.');
  });

  it('keeps the live region mounted and re-announces a repeated failure', async () => {
    const user = userEvent.setup();
    setup({ message: 'You need a connection to do this.', onRevoke: vi.fn(async () => false) });
    const live = screen.getByRole('status');
    await waitFor(() => expect(live).toHaveTextContent('You need a connection'));
    await user.click(screen.getByRole('button', { name: /Cancel this invitation/ }));
    expect(live).toBeEmptyDOMElement();
    await waitFor(() => expect(live).toHaveTextContent('You need a connection'));
    expect(screen.getByRole('status')).toBe(live);
  });
});

describe('PeopleHelping without a view', () => {
  it('shows only the message: no field, no button, no heading', async () => {
    setup({ view: null, status: 'offline', message: 'You need a connection to do this.' });
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.queryByRole('heading')).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('You need a connection to do this.'));
  });
});

describe('PeopleHelping as a member', () => {
  it('says only who they are helping', () => {
    setup({ view: { role: 'member', owner: { id: 'o1', name: 'Anna' } } });
    expect(screen.getByText("You're helping Anna.")).toBeInTheDocument();
    expect(screen.queryByLabelText('Their email')).not.toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toBeEmptyDOMElement();
  });

  it('falls back to "someone" without an owner name', () => {
    setup({ view: { role: 'member', owner: { id: 'o1', name: null } } });
    expect(screen.getByText("You're helping someone.")).toBeInTheDocument();
  });
});

describe('SHARING_ENABLED', () => {
  async function flag(value: string | undefined) {
    vi.resetModules();
    vi.stubEnv('VITE_FEATURE_SHARING', value);
    return (await import('../lib/features')).SHARING_ENABLED;
  }
  afterEach(() => vi.unstubAllEnvs());

  it('is on only when the variable is exactly "true"', async () => {
    expect(await flag('true')).toBe(true);
    expect(await flag('TRUE')).toBe(false);
    expect(await flag('1')).toBe(false);
    expect(await flag('false')).toBe(false);
    expect(await flag(undefined)).toBe(false);
  });
});
