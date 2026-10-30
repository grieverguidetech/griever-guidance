/** #460: with the editor on, a failed browser save shows a calm status note. */
import { render, screen } from '@testing-library/react';

const mocks = vi.hoisted(() => ({ cms: true }));

vi.mock('../lib/cmsFlag', () => ({
  get CMS_ENABLED() {
    return mocks.cms;
  },
}));

import { App } from './app';

const NOTE = "This browser isn't saving right now. Keep this tab open, or copy anything important.";

function seed() {
  window.localStorage.setItem(
    'gg.sessions.v1',
    JSON.stringify([
      {
        id: 's1',
        personName: 'Margaret Hayes',
        dateOfPassing: '',
        senderName: 'Anna',
        obituaryUrl: '',
        createdAt: '2026-10-10T00:00:00.000Z',
        lastOpenedAt: '2026-10-10T00:00:00.000Z',
        drafts: {},
        draftsUpdatedAt: {},
        serviceReady: false,
        recipientsNotified: {},
        momentCompletedAt: {},
        remindersScheduled: [],
      },
    ]),
  );
}

afterEach(() => {
  vi.restoreAllMocks();
});

beforeEach(() => {
  mocks.cms = true;
  window.localStorage.clear();
  seed();
});

describe('save failed note (#460)', () => {
  it('shows the note in a status region when the write throws', async () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota');
    });
    render(<App />);
    await screen.findByRole('heading', { level: 1, name: 'Overview' });
    const note = screen.getByText(NOTE);
    expect(note).toHaveAttribute('role', 'status');
  });

  it('shows nothing when saving works', async () => {
    render(<App />);
    await screen.findByRole('heading', { level: 1, name: 'Overview' });
    expect(screen.queryByText(NOTE)).toBeNull();
  });

  it('shows nothing with the editor off', async () => {
    mocks.cms = false;
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota');
    });
    render(<App />);
    await screen.findAllByRole('heading', { level: 1 });
    expect(screen.queryByText(NOTE)).toBeNull();
  });
});
