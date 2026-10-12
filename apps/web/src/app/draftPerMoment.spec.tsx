/**
 * #83: each moment keeps its own draft, so starting one never overwrites another that is half done.
 * The real App over real localStorage, seeded with a half-done announcement.
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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

async function backToLanding(user: User) {
  await user.click(screen.getByRole('button', { name: 'Back' }));
  if (!screen.queryByRole('heading', { name: 'One thing at a time.' })) {
    await user.click(screen.getByRole('button', { name: 'Back' }));
  }
  await screen.findByRole('heading', { name: 'One thing at a time.' });
}

describe('one draft per moment (#83)', () => {
  it('keeps the announcement intact after the service is started and the person goes back to it', async () => {
    seed({ announcement });
    const user = userEvent.setup();
    render(<App />);
    expect(await screen.findByLabelText(/Anything you'd like to add/)).toHaveValue(note);
    await backToLanding(user);

    await user.click(screen.getByRole('button', { name: /Share the service/ }));
    await user.click(screen.getByRole('button', { name: /Yes, we've set a date/ }));
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    await screen.findByLabelText('Service date');
    expect(savedDrafts()['service']).toMatchObject({ step: 'details', templateCategory: 'service' });
    expect(savedDrafts()['announcement']).toMatchObject(kept);

    await backToLanding(user);
    await user.click(screen.getByRole('button', { name: 'Start' }));
    expect(await screen.findByLabelText(/Anything you'd like to add/)).toHaveValue(note);
    expect(savedDrafts()['announcement']?.selectedContactIds).toEqual(['c-1', 'c-2']);
  });

  it('opens the service on its own draft, not a blank one, when it is started again', async () => {
    const service = freshDraft({ templateCategory: 'service', step: 'details', fields: { serviceLocation: 'St Mary Church' } });
    seed({ announcement, service }, { serviceReady: true });
    const user = userEvent.setup();
    render(<App />);
    await screen.findByLabelText(/Anything you'd like to add/); // the announcement is the older one
    await backToLanding(user);
    await user.click(screen.getByRole('button', { name: /Share the service/ }));
    expect(await screen.findByLabelText(/^Location/)).toHaveValue('St Mary Church');
  });

  it('does not wipe the announcement or its contacts when the obituary is shared', async () => {
    seed({ announcement }, { obituaryUrl: 'https://example.com/margaret' });
    const user = userEvent.setup();
    render(<App />);
    await screen.findByLabelText(/Anything you'd like to add/);
    await backToLanding(user);

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
    await screen.findByLabelText(/Anything you'd like to add/); // the newer draft reopens
    await backToLanding(user);
    await user.click(screen.getByRole('button', { name: /Share the obituary/ }));
    await user.click(screen.getByRole('button', { name: 'Choose who to send it to' }));
    expect(savedDrafts()['obituary']).toMatchObject({ step: 'review', selectedContactIds: ['c-9'] });
    expect(await screen.findByRole('button', { name: 'Text these people' })).toBeInTheDocument();
  });
});
