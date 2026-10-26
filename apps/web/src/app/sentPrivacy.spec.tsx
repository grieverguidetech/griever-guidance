/**
 * C2 (#82): once a message has been sent, its wording is not kept. The real App over real
 * localStorage: type a note, edit the wording, send, and look at everything the app saved.
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { contactStore } from '@griever/data-local';
import { freshDraft } from '@griever/hooks';
import { App } from './app';

const note = 'She was peaceful and we were with her at the end.';
const edited = 'My own private words for the family.';

async function sendAnAnnouncement(user: ReturnType<typeof userEvent.setup>) {
  render(<App />);
  await user.click(await screen.findByRole('button', { name: "Start with someone I've lost" }));
  await user.type(screen.getByLabelText('Their name'), 'Margaret Hayes');
  await user.click(screen.getByRole('button', { name: 'Continue' }));
  await user.type(screen.getByLabelText('Name'), 'Aunt Carol');
  await user.type(screen.getByLabelText('Mobile number'), '6175550148');
  await user.click(screen.getByRole('button', { name: 'Add and start another' }));
  await screen.findByText('Added so far — 1');
  await user.click(screen.getByRole('button', { name: 'Done for now' }));
  await user.click(screen.getByRole('button', { name: 'Save and continue' }));
  await user.click(screen.getByRole('button', { name: 'Start' }));
  await user.type(screen.getByLabelText(/Anything you'd like to add/), note);
  await user.click(screen.getByRole('button', { name: 'Continue' }));
  await user.click(await screen.findByRole('checkbox', { name: /Aunt Carol/ }));
  await user.click(screen.getByRole('button', { name: 'Continue' }));
  await user.click(screen.getByRole('button', { name: 'Edit wording' }));
  const box = screen.getByRole('textbox');
  await user.clear(box);
  await user.type(box, edited);
  await user.click(screen.getByRole('button', { name: 'Done editing' }));
  await user.click(screen.getByRole('button', { name: /^Text 1 person/ }));
  await user.click(screen.getByRole('button', { name: 'Open Messages' }));
  await user.click(screen.getByRole('button', { name: 'Done' }));
}

describe('after a send (C2)', () => {
  it('keeps none of the wording in localStorage, and opens the path with a note', async () => {
    const user = userEvent.setup();
    await sendAnAnnouncement(user);

    expect(await screen.findByRole('heading', { name: 'One thing at a time.' })).toBeInTheDocument();
    expect(screen.getByText('Everyone has been told.')).toBeInTheDocument();
    expect(screen.getByText(/We don't keep a copy of what was sent/)).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Everyone has been told.' })).not.toBeInTheDocument();

    const stored = JSON.stringify({ ...window.localStorage });
    expect(stored).not.toContain('peaceful');
    expect(stored).not.toContain('private words');
    // What the app still needs afterwards: the step, the moment and who was told.
    const [saved] = JSON.parse(window.localStorage.getItem('gg.sessions.v1') ?? '[]');
    expect(saved.drafts.announcement).toMatchObject({ step: 'sent', templateCategory: 'announcement', fields: {}, messageOverride: null });
    expect(saved.drafts.announcement.selectedContactIds).toHaveLength(1);
    expect(saved.recipientsNotified.announcement).toHaveLength(1);
  }, 30_000); // a whole journey under load
});

describe('after a Share the service send (C2, #195)', () => {
  it('keeps none of the edited message in localStorage', async () => {
    const editedService = 'Come as you are, two o\'clock at Oak Chapel.';
    await contactStore.put({
      contactId: 'c-1', name: 'Aunt Carol', phone: '+16175550148', email: null, tier: 'first', source: 'manual', createdAt: 1,
    });
    const service = freshDraft({
      templateCategory: 'service',
      templateOverrideId: 'share-service',
      step: 'review',
      fields: { serviceDate: 'June 14', serviceTime: '2:00 PM', serviceLocation: 'Oak Chapel' },
      selectedContactIds: ['c-1'],
    });
    window.localStorage.setItem('gg.sessions.v1', JSON.stringify([{
      id: 's-1', personName: 'Margaret Hayes', dateOfPassing: '', senderName: 'Anna', obituaryUrl: '',
      createdAt: '2026-10-10T00:00:00.000Z', lastOpenedAt: '2026-10-10T00:00:00.000Z',
      drafts: { service }, draftsUpdatedAt: { service: '2026-10-10T00:00:00.000Z' },
      serviceReady: true, recipientsNotified: {}, momentCompletedAt: {}, remindersScheduled: [],
    }]));
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole('button', { name: 'Margaret Hayes' }));
    await user.click(await screen.findByRole('button', { name: /Share the service/ }));
    const box = await screen.findByLabelText('Your message');
    await user.clear(box);
    await user.type(box, editedService);
    await user.click(screen.getByRole('button', { name: 'Text these people' }));
    await user.click(await screen.findByRole('button', { name: 'Open Messages' }));
    await user.click(screen.getByRole('button', { name: 'Done' }));
    await screen.findByRole('heading', { name: 'One thing at a time.' });

    const stored = JSON.stringify({ ...window.localStorage });
    expect(stored).not.toContain('Come as you are');
    const [saved] = JSON.parse(window.localStorage.getItem('gg.sessions.v1') ?? '[]');
    expect(saved.drafts.service.messageOverride).toBeNull();
  }, 30_000);
});
