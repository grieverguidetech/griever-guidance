/**
 * "Saved as you go" (#25, DS-3): every flow step's values are on the device the moment they are
 * typed, and reopening the app puts the person back on that step. A "reload" here is an unmount and
 * a fresh <App /> over the same localStorage and IndexedDB, which is all a real reload keeps.
 */
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from './app';

type User = ReturnType<typeof userEvent.setup>;

function reload(view: { unmount: () => void }) {
  view.unmount();
  return render(<App />);
}

async function onboardToLanding(user: User) {
  const view = render(<App />);
  await user.type(screen.getByLabelText('Name'), 'Aunt Carol');
  await user.type(screen.getByLabelText('Mobile number'), '6175550148');
  await user.click(screen.getByRole('button', { name: 'Add and start another' }));
  await screen.findByText('Added so far — 1');
  await user.click(screen.getByRole('button', { name: 'Done for now' }));
  await user.click(screen.getByRole('button', { name: 'Save and continue' }));
  await user.type(screen.getByLabelText('Their name'), 'Margaret Hayes');
  await user.click(screen.getByRole('button', { name: 'Continue' }));
  return view;
}

async function startAnnouncement(user: User) {
  const view = await onboardToLanding(user);
  await user.click(screen.getByRole('button', { name: 'Start' }));
  return view;
}

const note = 'She was peaceful, and we were with her.';

describe('saved as you go', () => {
  it('says so in the agreed words, with no Save button', async () => {
    const user = userEvent.setup();
    await startAnnouncement(user);
    expect(
      screen.getByText('Everything is saved on this phone as you go. You can stop and come back.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /save/i })).not.toBeInTheDocument();
  });

  it('keeps the person and sender typed on the setup step', async () => {
    const user = userEvent.setup();
    const view = render(<App />);
    await user.type(screen.getByLabelText('Name'), 'Aunt Carol');
    await user.type(screen.getByLabelText('Mobile number'), '6175550148');
    await user.click(screen.getByRole('button', { name: 'Add and start another' }));
    await screen.findByText('Added so far — 1');
    await user.click(screen.getByRole('button', { name: 'Done for now' }));
    await user.click(screen.getByRole('button', { name: 'Save and continue' }));
    await user.type(screen.getByLabelText('Their name'), 'Margaret Hayes');
    await user.type(screen.getByLabelText(/Your name/), 'Peter');

    reload(view);
    await screen.findByRole('heading', { name: 'One thing at a time.' });
    expect(screen.getByText('For Margaret Hayes')).toBeInTheDocument();
  });

  it('keeps the announcement note and reopens on that step', async () => {
    const user = userEvent.setup();
    const view = await startAnnouncement(user);
    await user.type(screen.getByLabelText(/Anything you'd like to add/), note);

    reload(view);
    expect(await screen.findByRole('heading', { name: 'Announce the passing' })).toBeInTheDocument();
    expect(screen.getByLabelText(/Anything you'd like to add/)).toHaveValue(note);
  });

  it('keeps the service-known choice, even before Continue', async () => {
    const user = userEvent.setup();
    const view = await startAnnouncement(user);
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    await user.click(screen.getByRole('button', { name: /Yes, I have them/ }));

    reload(view);
    const yes = await screen.findByRole('button', { name: /Yes, I have them/ });
    expect(yes).toHaveAttribute('aria-pressed', 'true');
  });

  it('keeps the service details, the chosen people and an edited message', async () => {
    const user = userEvent.setup();
    let view = await startAnnouncement(user);
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    await user.click(screen.getByRole('button', { name: /Yes, I have them/ }));
    await user.click(screen.getByRole('button', { name: 'Continue' }));

    await user.type(screen.getByLabelText(/^Location/), 'St Mary Church');
    view = reload(view);
    expect(await screen.findByLabelText(/^Location/)).toHaveValue('St Mary Church');

    // Pasted, not typed: a half-typed date such as "May 2" already parses as a past date, and the
    // contact-retention effect would clear the contacts (a separate bug, flagged on #25).
    await user.click(screen.getByLabelText('Service date'));
    await user.paste('May 29, 2099');
    await user.click(screen.getByLabelText(/^Time/));
    await user.paste('11:00 am');
    await user.click(screen.getByRole('button', { name: 'Continue' }));

    await user.click(await screen.findByRole('button', { name: /Aunt Carol/ }));
    view = reload(view);
    expect(await screen.findByRole('button', { name: /Aunt Carol/ })).toHaveAttribute('aria-pressed', 'true');

    await user.click(screen.getByRole('button', { name: 'Continue' }));
    await user.click(screen.getByRole('button', { name: 'Edit wording' }));
    const box = screen.getByRole('textbox');
    await user.clear(box);
    await user.type(box, 'My own words');

    reload(view);
    expect(await screen.findByText('My own words')).toBeInTheDocument();
  });

  it('never waits on the network when Continue moves on', async () => {
    const user = userEvent.setup();
    await startAnnouncement(user);
    const fetchSpy = vi.fn(() => new Promise<Response>(() => undefined)); // an offline fetch that never settles
    vi.stubGlobal('fetch', fetchSpy);
    try {
      await user.click(screen.getByRole('button', { name: 'Continue' }));
      await waitFor(() =>
        expect(screen.getByRole('heading', { name: 'Do you know the service details?' })).toBeInTheDocument(),
      );
      expect(fetchSpy).not.toHaveBeenCalled();
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
