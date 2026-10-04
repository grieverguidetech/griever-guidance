/**
 * Integration tests for the web app's onboarding (auth flagged off, the
 * default): the real App with real hooks, localStorage and an in-memory
 * IndexedDB. Nothing talks to the gateway.
 */
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from './app';

async function addContact(user: ReturnType<typeof userEvent.setup>, name: string, phone: string) {
  await user.type(screen.getByLabelText('Name'), name);
  await user.type(screen.getByLabelText('Mobile number'), phone);
  await user.click(screen.getByRole('button', { name: 'Add and start another' }));
}

describe('App onboarding', () => {
  it('starts a first visit at adding contacts, with no account step', () => {
    render(<App />);
    expect(screen.getByRole('heading', { level: 1, name: 'Who should we be able to reach?' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Back' })).not.toBeInTheDocument();
  });

  it('only enables adding once both name and number are filled', async () => {
    const user = userEvent.setup();
    render(<App />);
    const add = screen.getByRole('button', { name: 'Add and start another' });
    expect(add).toBeDisabled();
    await user.type(screen.getByLabelText('Name'), 'Aunt Carol');
    expect(add).toBeDisabled();
    await user.type(screen.getByLabelText('Mobile number'), '6175550148');
    expect(add).toBeEnabled();
  });

  it('explains a bad number calmly and keeps what was typed', async () => {
    const user = userEvent.setup();
    render(<App />);
    await addContact(user, 'Aunt Carol', '123');
    expect(screen.getByText("That number doesn't look right — check the area code and digits.")).toBeInTheDocument();
    expect(screen.getByLabelText('Name')).toHaveValue('Aunt Carol');
    expect(screen.queryByText(/Added so far/)).not.toBeInTheDocument();
  });

  it('walks contacts → who hears first → their details → one next thing', async () => {
    const user = userEvent.setup();
    render(<App />);

    await addContact(user, 'Aunt Carol', '(617) 555-0148');
    expect(await screen.findByText('Added so far — 1')).toBeInTheDocument();
    expect(screen.getByText('(617) 555-0148')).toBeInTheDocument();
    expect(screen.getByLabelText('Name')).toHaveValue('');

    await user.click(screen.getByRole('button', { name: 'Done for now' }));
    expect(screen.getByRole('heading', { name: 'Who should hear first?' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Save and continue' }));

    expect(screen.getByRole('heading', { name: 'Who are we writing about?' })).toBeInTheDocument();
    const cont = screen.getByRole('button', { name: 'Continue' });
    expect(cont).toBeDisabled();
    await user.type(screen.getByLabelText('Their name'), 'Margaret Hayes');
    await user.type(screen.getByLabelText('Date they passed'), 'May 29, 2026');
    expect(cont).toBeEnabled();
    await user.click(cont);

    expect(screen.getByRole('heading', { name: 'One thing at a time.' })).toBeInTheDocument();
    expect(screen.getByText('For Margaret Hayes')).toBeInTheDocument();
    expect(screen.getByText('Announce the passing')).toBeInTheDocument();
  });

  it('sends a returning visitor straight back to their session', async () => {
    const user = userEvent.setup();
    const first = render(<App />);
    await addContact(user, 'Aunt Carol', '6175550148');
    await screen.findByText('Added so far — 1');
    await user.click(screen.getByRole('button', { name: 'Done for now' }));
    await user.click(screen.getByRole('button', { name: 'Save and continue' }));
    await user.type(screen.getByLabelText('Their name'), 'Margaret Hayes');
    first.unmount();

    render(<App />);
    await waitFor(() => expect(screen.getByRole('heading', { name: 'One thing at a time.' })).toBeInTheDocument());
    expect(screen.getByText('For Margaret Hayes')).toBeInTheDocument();
  });

  it('keeps contact names and numbers out of localStorage (they stay in IndexedDB)', async () => {
    const user = userEvent.setup();
    render(<App />);
    await addContact(user, 'Aunt Carol', '6175550148');
    await screen.findByText('Added so far — 1');
    const stored = JSON.stringify({ ...window.localStorage });
    expect(stored).not.toContain('Aunt Carol');
    expect(stored).not.toContain('5550148');
  });
});
