/**
 * #83: each moment keeps its own draft, so starting one never overwrites another that is half done.
 * The real App over real localStorage, seeded with a half-done announcement.
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { contactStore } from '@griever/data-local';
import { freshDraft } from '@griever/hooks';
import type { SendFlowDraft } from '@griever/hooks';
import { App } from './app';

type User = ReturnType<typeof userEvent.setup>;

const note = 'She was peaceful, and we were with her.';

function seed(drafts: Record<string, SendFlowDraft>, extra: Record<string, unknown> = {}) {
  const session = {
    id: 's-1',
    personName: 'Margaret Hayes',
    dateOfPassing: '',
    senderName: 'Anna',
    obituaryUrl: '',
    createdAt: '2026-10-10T00:00:00.000Z',
    lastOpenedAt: '2026-10-10T00:00:00.000Z',
    drafts,
    draftsUpdatedAt: Object.fromEntries(Object.keys(drafts).map((k) => [k, '2026-10-10T00:00:00.000Z'])),
    serviceReady: false,
    recipientsNotified: {},
    momentCompletedAt: {},
    remindersScheduled: [],
    ...extra,
  };
  window.localStorage.setItem('gg.sessions.v1', JSON.stringify([session]));
}

const announcement = freshDraft({
  templateCategory: 'announcement',
  step: 'announce',
  fields: { personalNote: note },
  selectedContactIds: ['c-1', 'c-2'],
});

// Backing out of the form moves the step to the picker; what was typed and chosen must stay.
const kept = { templateCategory: 'announcement', fields: announcement.fields, selectedContactIds: announcement.selectedContactIds };

function savedDrafts() {
  const [saved] = JSON.parse(window.localStorage.getItem('gg.sessions.v1') ?? '[]');
  return saved.drafts as Record<string, SendFlowDraft>;
}

/** A reopened app lands on Home (#112); the person is opened from there, on their path (#176). */
async function openFromHome(user: User) {
  await user.click(await screen.findByRole('button', { name: 'Margaret Hayes' }));
  await screen.findByRole('heading', { name: 'One thing at a time.' });
}

/** The half-written announcement shows "Started" on the path; one tap on Continue resumes it. */
async function resumeAnnouncement(user: User) {
  await user.click(await screen.findByRole('button', { name: 'Continue' }));
}

/** Back from a moment's first form returns to the path (#176); from a later step it goes back one. */
async function backToLanding(user: User) {
  for (let i = 0; i < 3 && !screen.queryByRole('heading', { name: 'One thing at a time.' }); i += 1) {
    await user.click(screen.getByRole('button', { name: 'Back' }));
  }
  await screen.findByRole('heading', { name: 'One thing at a time.' });
}

describe('one draft per moment (#83)', () => {
  it('keeps the announcement intact after the service is started and the person goes back to it', async () => {
    seed({ announcement });
    const user = userEvent.setup();
    render(<App />);
    await openFromHome(user);
    await resumeAnnouncement(user);
    expect(await screen.findByLabelText(/Anything you'd like to add/)).toHaveValue(note);
    await backToLanding(user);

    await user.click(screen.getByRole('button', { name: /Share the service/ }));
    await user.click(screen.getByRole('button', { name: /Yes, we've set a date/ }));
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    await screen.findByLabelText('Service date');
    expect(savedDrafts()['service']).toMatchObject({ step: 'details', templateCategory: 'service' });
    expect(savedDrafts()['announcement']).toMatchObject(kept);

    await backToLanding(user);
    await resumeAnnouncement(user);
    expect(await screen.findByLabelText(/Anything you'd like to add/)).toHaveValue(note);
    expect(savedDrafts()['announcement']?.selectedContactIds).toEqual(['c-1', 'c-2']);
  });

  it('opens the service on its own draft, not a blank one, when it is started again', async () => {
    const service = freshDraft({ templateCategory: 'service', step: 'details', fields: { serviceLocation: 'St Mary Church' } });
    seed({ announcement, service }, { serviceReady: true });
    const user = userEvent.setup();
    render(<App />);
    await openFromHome(user);
    await user.click(screen.getByRole('button', { name: /Share the service/ }));
    expect(await screen.findByLabelText(/^Location/)).toHaveValue('St Mary Church');
  });

  it('does not wipe the announcement or its contacts when the obituary is shared', async () => {
    seed({ announcement }, { obituaryUrl: 'https://example.com/margaret' });
    const user = userEvent.setup();
    render(<App />);
    await openFromHome(user);
    await user.click(screen.getByRole('button', { name: /Share the obituary/ }));
    await user.click(screen.getByRole('button', { name: 'Choose who to send it to' }));
    expect(savedDrafts()['obituary']).toMatchObject({ step: 'contacts', templateCategory: 'obituary' });
    expect(savedDrafts()['announcement']).toMatchObject(kept);
  });

  it("keeps the obituary's chosen contacts when Continue is pressed again", async () => {
    const obituary = freshDraft({
      templateCategory: 'obituary',
      templateOverrideId: 'obituary-link',
      step: 'review',
      selectedContactIds: ['c-9'],
    });
    seed(
      { announcement, obituary },
      {
        obituaryUrl: 'https://example.com/margaret',
        draftsUpdatedAt: { obituary: '2026-10-09T00:00:00.000Z', announcement: '2026-10-10T00:00:00.000Z' },
      },
    );
    const user = userEvent.setup();
    render(<App />);
    await openFromHome(user);
    await user.click(screen.getByRole('button', { name: /Share the obituary/ }));
    await user.click(screen.getByRole('button', { name: 'Choose who to send it to' }));
    expect(savedDrafts()['obituary']).toMatchObject({ step: 'review', selectedContactIds: ['c-9'] });
    expect(await screen.findByRole('button', { name: 'Text these people' })).toBeInTheDocument();
  });

  it('keeps the service draft when the service is started after a sent announcement', async () => {
    await contactStore.put({
      contactId: 'c-1', name: 'Aunt Carol', phone: '+16175550148', email: null, tier: 'first', source: 'manual', createdAt: 1,
    });
    const service = freshDraft({
      templateCategory: 'service',
      step: 'details',
      fields: { serviceLocation: 'St Mary Church' },
      selectedContactIds: ['c-5'],
    });
    const review = freshDraft({ templateCategory: 'announcement', step: 'review', selectedContactIds: ['c-1'], serviceDetailsKnown: 'no' });
    seed({ announcement: review, service }, { draftsUpdatedAt: { announcement: '2026-10-10T00:00:00.000Z', service: '2026-10-09T00:00:00.000Z' } });
    const user = userEvent.setup();
    render(<App />);
    await openFromHome(user);
    await resumeAnnouncement(user);
    await user.click(await screen.findByRole('button', { name: /^Text 1 person/ }));
    await user.click(screen.getByRole('button', { name: 'Open Messages' }));
    await user.click(screen.getByRole('button', { name: 'Done' }));
    // Done opens the path; the service, now next, is resumed from there on its own draft.
    expect(await screen.findByRole('heading', { name: 'One thing at a time.' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Continue' }));

    expect(await screen.findByLabelText(/^Location/)).toHaveValue('St Mary Church');
    expect(savedDrafts()['service']?.fields).toEqual({ serviceLocation: 'St Mary Church' });
    expect(savedDrafts()['service']?.selectedContactIds).toEqual(['c-5']);
  }, 30_000);
});

describe('start this message again (#98)', () => {
  it('shows no start-again link on an empty service form started after a sent announcement', async () => {
    await contactStore.put({
      contactId: 'c-1', name: 'Aunt Carol', phone: '+16175550148', email: null, tier: 'first', source: 'manual', createdAt: 1,
    });
    const service = freshDraft({
      templateCategory: 'service',
      step: 'details',
      fields: {},
      selectedContactIds: ['c-5'],
    });
    const review = freshDraft({ templateCategory: 'announcement', step: 'review', selectedContactIds: ['c-1'], serviceDetailsKnown: 'no' });
    seed({ announcement: review, service }, { draftsUpdatedAt: { announcement: '2026-10-10T00:00:00.000Z', service: '2026-10-09T00:00:00.000Z' } });
    const user = userEvent.setup();
    render(<App />);
    await openFromHome(user);
    await resumeAnnouncement(user);
    await user.click(await screen.findByRole('button', { name: /^Text 1 person/ }));
    await user.click(screen.getByRole('button', { name: 'Open Messages' }));
    await user.click(screen.getByRole('button', { name: 'Done' }));
    // Done opens the path; the service, now next, is started from there.
    expect(await screen.findByRole('heading', { name: 'One thing at a time.' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Start' })); // empty, so not "Started"

    expect(await screen.findByLabelText(/^Location/)).toHaveValue('');
    expect(savedDrafts()['service']?.selectedContactIds).toEqual(['c-5']);
    expect(screen.queryByRole('button', { name: 'Start this message again' })).not.toBeInTheDocument();
  }, 30_000);

  const link = () => screen.queryByRole('button', { name: 'Start this message again' });
  const service = freshDraft({ templateCategory: 'service', step: 'details', fields: { serviceLocation: 'St Mary Church' } });

  async function putContact() {
    await contactStore.put({
      contactId: 'c-1', name: 'Aunt Carol', phone: '+16175550148', email: null, tier: 'first', source: 'manual', createdAt: 1,
    });
  }

  it('is hidden while the draft is empty', async () => {
    seed({ announcement: freshDraft({ templateCategory: 'announcement', step: 'announce' }) });
    const user = userEvent.setup();
    render(<App />);
    await openFromHome(user);
    await user.click(screen.getByRole('button', { name: 'Start' })); // opened but empty: not "Started"
    await screen.findByLabelText(/Anything you'd like to add/);
    expect(link()).not.toBeInTheDocument();
  });

  it('clears only this moment after a confirm, and leaves the other moment and the contacts alone', async () => {
    await putContact();
    seed({ announcement, service }, { serviceReady: true, recipientsNotified: { announcement: ['c-1'] } });
    const user = userEvent.setup();
    render(<App />);
    await openFromHome(user);
    // The announcement is done (c-1 was told); its row reopens the half-written draft.
    await user.click(screen.getByRole('button', { name: /Told close family/ }));
    await screen.findByLabelText(/Anything you'd like to add/);
    await user.click(link() as HTMLElement);
    const confirm = screen.getByText(/Clear what you've written for this message\? People and contacts stay as they are\./);
    expect(confirm.closest('[role="group"]')).toHaveFocus();
    await user.click(screen.getByRole('button', { name: 'Clear it' }));

    expect(screen.getByLabelText(/Anything you'd like to add/)).toHaveValue('');
    expect(link()).not.toBeInTheDocument();
    expect(savedDrafts()['announcement']).toMatchObject({ templateCategory: 'announcement', fields: {} });
    expect(savedDrafts()['service']).toMatchObject({ fields: { serviceLocation: 'St Mary Church' } });
    const [saved] = JSON.parse(window.localStorage.getItem('gg.sessions.v1') ?? '[]');
    expect(saved.recipientsNotified).toEqual({ announcement: ['c-1'] });
    expect(saved.personName).toBe('Margaret Hayes');
    expect((await contactStore.list()).map((c) => c.contactId)).toEqual(['c-1']);
  });

  it('changes nothing on Keep and puts focus back on the link', async () => {
    seed({ announcement });
    const user = userEvent.setup();
    render(<App />);
    await openFromHome(user);
    await resumeAnnouncement(user);
    await screen.findByLabelText(/Anything you'd like to add/);
    await user.click(link() as HTMLElement);
    await user.click(screen.getByRole('button', { name: 'Keep it' }));
    expect(screen.getByLabelText(/Anything you'd like to add/)).toHaveValue(note);
    expect(link()).toHaveFocus();
    expect(savedDrafts()['announcement']).toMatchObject(kept);
  });

  it('is offered on the service form too', async () => {
    seed({ service }, { serviceReady: true });
    const user = userEvent.setup();
    render(<App />);
    await openFromHome(user);
    await user.click(screen.getByRole('button', { name: /Share the service/ }));
    await screen.findByLabelText(/^Location/);
    await user.click(link() as HTMLElement);
    await user.click(screen.getByRole('button', { name: 'Clear it' }));
    expect(screen.getByLabelText(/^Location/)).toHaveValue('');
  });
});
