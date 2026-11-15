/**
 * #849 follow-up: people saved before sharing have no flowId. The App must give each one a flowId on
 * the first load, save it, keep it across reloads, and use it for the landing and the side nav links.
 * Real localStorage, the real route table, the editor on and auth off (as in the local preview).
 */
import { StrictMode } from 'react';
import type { ReactElement } from 'react';
import { screen, waitFor, within } from '@testing-library/react';
import { renderApp } from '../test/renderApp';

vi.mock('../lib/features', () => ({
  AUTH_ENABLED: false,
  OBITUARY_DRAFTING_ENABLED: false,
  PAYMENTS_ENABLED: false,
  SHARING_ENABLED: false,
}));
vi.mock('../lib/cmsFlag', () => ({ CMS_ENABLED: true }));

import { App } from './app';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** A person as saved before sharing: no flowId, ownerId or role. */
function seedLegacy(personName = 'Margaret Hayes') {
  window.localStorage.setItem(
    'gg.sessions.v1',
    JSON.stringify([
      {
        id: 's-1',
        personName,
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

function storedFlowIds(): (string | undefined)[] {
  return (JSON.parse(window.localStorage.getItem('gg.sessions.v1') ?? '[]') as { flowId?: string }[]).map((s) => s.flowId);
}

function nav() {
  return within(screen.getByRole('navigation', { name: /^Sections/ }));
}

// main.tsx renders the app in StrictMode, so both are checked.
describe.each([
  ['plain', (ui: ReactElement) => ui],
  ['StrictMode', (ui: ReactElement) => <StrictMode>{ui}</StrictMode>],
])('legacy data with no flowId (%s)', (_label, wrap) => {
  it('saves a flowId on the first load, keeps it across a reload, and lands on that person\'s path', async () => {
    seedLegacy();
    const first = renderApp(wrap(<App />));
    await screen.findByRole('heading', { level: 1, name: 'Overview' });
    await waitFor(() => expect(storedFlowIds()[0]).toMatch(UUID));
    const flowId = storedFlowIds()[0] as string;
    await waitFor(() => expect(window.location.pathname).toBe(`/people/${flowId}`));
    expect(nav().getByRole('link', { name: /^Service/ })).toHaveAttribute('href', `/people/${flowId}/service`);
    expect(nav().getByRole('link', { name: 'Overview' })).toHaveAttribute('aria-current', 'page');

    // A reload of `/` lands on the same path; the id was saved, not made again.
    first.unmount();
    renderApp(wrap(<App />), { path: '/' });
    await screen.findByRole('heading', { level: 1, name: 'Overview' });
    await waitFor(() => expect(window.location.pathname).toBe(`/people/${flowId}`));
    expect(storedFlowIds()).toEqual([flowId]);
  });

  it('a deep link made after the upgrade still opens after a reload', async () => {
    seedLegacy();
    const first = renderApp(wrap(<App />));
    await screen.findByRole('heading', { level: 1, name: 'Overview' });
    await waitFor(() => expect(storedFlowIds()[0]).toMatch(UUID));
    const flowId = storedFlowIds()[0] as string;
    first.unmount();
    renderApp(wrap(<App />), { path: `/people/${flowId}/service` });
    expect(await screen.findByRole('heading', { level: 1, name: 'Service' })).toBeInTheDocument();
    expect(window.location.pathname).toBe(`/people/${flowId}/service`);
  });
});

describe('legacy data with nobody listable', () => {
  // An unnamed person with no work is not listed, so the app shows the empty Overview. Until R2b (#856)
  // gives the empty pages `/start`, they stay on `/` and their nav items are buttons: that is expected.
  it('shows the empty Overview on `/`, with buttons in the nav', async () => {
    seedLegacy('');
    renderApp(<App />);
    expect(await screen.findByRole('button', { name: "Start with someone I've lost" })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: 'Overview' })).toBeInTheDocument();
    expect(window.location.pathname).toBe('/');
    expect(nav().queryAllByRole('link')).toHaveLength(0);
  });
});

describe('a person whose flowId is not a path id', () => {
  it('still opens the editor, with buttons in the nav, instead of failing the page', async () => {
    window.localStorage.setItem(
      'gg.sessions.v1',
      JSON.stringify([
        {
          id: 's-1',
          flowId: 'not a path id',
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
    renderApp(<App />);
    expect(await screen.findByRole('heading', { level: 1, name: 'Your people' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Margaret Hayes' })).toBeInTheDocument();
    expect(nav().queryAllByRole('link')).toHaveLength(0);
  });
});
