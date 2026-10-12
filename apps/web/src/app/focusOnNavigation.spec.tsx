/**
 * #50: when the view or flow step changes, focus moves to the new screen's h1 so a screen reader
 * announces it. It never moves on first load. The real App over real localStorage.
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { freshDraft } from '@griever/hooks';
import { App } from './app';

function seedAnnouncementStep() {
  const draft = freshDraft({ templateCategory: 'announcement', step: 'announce' });
  const session = {
    id: 's-1',
    personName: 'Margaret Hayes',
    dateOfPassing: '',
    senderName: 'Anna',
    obituaryUrl: '',
    createdAt: '2026-10-10T00:00:00.000Z',
    lastOpenedAt: '2026-10-10T00:00:00.000Z',
    drafts: { announcement: draft },
    draftsUpdatedAt: { announcement: '2026-10-10T00:00:00.000Z' },
    serviceReady: false,
    recipientsNotified: {},
    momentCompletedAt: {},
    remindersScheduled: [],
  };
  window.localStorage.setItem('gg.sessions.v1', JSON.stringify([session]));
}

describe('focus follows the screen heading (#50)', () => {
  it('does not move focus on first load', () => {
    render(<App />);
    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
    expect(document.activeElement).toBe(document.body);
  });

  it('moves focus to the new h1 on Continue and back to the previous h1 on Back', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.type(screen.getByLabelText('Name'), 'Aunt Carol');
    await user.type(screen.getByLabelText('Mobile number'), '6175550148');
    await user.click(screen.getByRole('button', { name: 'Add and start another' }));
    await screen.findByText('Added so far — 1');
    // An in-place re-render on the same screen leaves focus where it was.
    expect(document.activeElement).not.toBe(screen.getByRole('heading', { level: 1 }));

    await user.click(screen.getByRole('button', { name: 'Done for now' }));
    const next = screen.getByRole('heading', { level: 1, name: 'Who should hear first?' });
    expect(document.activeElement).toBe(next);

    await user.click(screen.getByRole('button', { name: 'Back' }));
    const previous = screen.getByRole('heading', { level: 1, name: 'Who should we be able to reach?' });
    expect(document.activeElement).toBe(previous);
  });

  it('moves focus to the new h1 when a flow step changes', async () => {
    seedAnnouncementStep();
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole('button', { name: 'Margaret Hayes' }));
    // Opening the person from Home is itself a navigation, so focus is already on the new h1.
    const announce = await screen.findByRole('heading', { level: 1, name: 'Announce the passing' });
    expect(document.activeElement).toBe(announce);

    await user.click(screen.getByRole('button', { name: 'Back' }));
    const picker = await screen.findByRole('heading', { level: 1, name: 'What would you like to send?' });
    expect(document.activeElement).toBe(picker);
  });
});
