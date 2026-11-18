/**
 * #852: one generic tab title per route, and never a person's name. The unit half checks the table;
 * the integration half renders the real App over the real route table with a person named Margaret
 * saved on this device, at every route, and reads `document.title`.
 */
import { render, screen, waitFor } from '@testing-library/react';
import type { ClerkLoadResult } from '../lib/authClient';
import { fakeClerk } from '../test-clerk';
import { renderApp } from '../test/renderApp';
import { titleForPath, useDocumentTitle } from './useDocumentTitle';

const mocks = vi.hoisted(() => ({
  cms: true,
  auth: false,
  loadClerk: vi.fn<() => Promise<ClerkLoadResult>>(),
}));

vi.mock('../lib/features', () => ({
  get AUTH_ENABLED() {
    return mocks.auth;
  },
  OBITUARY_DRAFTING_ENABLED: false,
  PAYMENTS_ENABLED: false,
  SHARING_ENABLED: false,
}));
vi.mock('../lib/authClient', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/authClient')>();
  return { ...actual, loadClerk: mocks.loadClerk };
});
vi.mock('../lib/cmsFlag', () => ({
  get CMS_ENABLED() {
    return mocks.cms;
  },
}));

import { App } from '../app/app';

const FLOW = '3f2b8c1e-9d4a-4c7e-b1f0-2a6d5e8c9b10';

describe('titleForPath', () => {
  it.each([
    ['/', 'Grievers Guidance'],
    ['/sign-in', 'Sign in · Grievers Guidance'],
    ['/sign-in/factor-one', 'Sign in · Grievers Guidance'],
    ['/sign-up', 'Create an account · Grievers Guidance'],
    ['/people', 'Your people · Grievers Guidance'],
    [`/people/${FLOW}`, 'Overview · Grievers Guidance'],
    [`/people/${FLOW}/person`, 'The person · Grievers Guidance'],
    [`/people/${FLOW}/announcement`, 'Announcement · Grievers Guidance'],
    [`/people/${FLOW}/service`, 'Service · Grievers Guidance'],
    [`/people/${FLOW}/obituary`, 'Obituary · Grievers Guidance'],
    [`/people/${FLOW}/thanks`, 'Thank-yous · Grievers Guidance'],
    [`/people/${FLOW}/guide/officiant`, 'Checklist · Grievers Guidance'],
    ['/start', 'Overview · Grievers Guidance'],
    ['/start/service', 'Service · Grievers Guidance'],
    ['/start/guide/officiant', 'Checklist · Grievers Guidance'],
    ['/account', 'Your account · Grievers Guidance'],
    ['/join', 'Invitation · Grievers Guidance'],
    ['/nope', 'Page not found · Grievers Guidance'],
  ])('%s is "%s"', (path, title) => {
    expect(titleForPath(path)).toBe(title);
  });
});

describe('useDocumentTitle', () => {
  function Titled({ title }: { title: string }) {
    useDocumentTitle(title);
    return null;
  }

  it('sets the title, follows a change, and puts the earlier one back on unmount', () => {
    document.title = 'Before';
    const view = render(<Titled title="One" />);
    expect(document.title).toBe('One');
    view.rerender(<Titled title="Two" />);
    expect(document.title).toBe('Two');
    view.unmount();
    expect(document.title).toBe('Before');
  });
});

function seedMargaret() {
  window.localStorage.setItem(
    'gg.sessions.v1',
    JSON.stringify([
      {
        id: 's-local-1',
        flowId: FLOW,
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

const PERSON = `/people/${FLOW}`;
const OVERVIEW = 'Overview · Grievers Guidance';
const NOT_FOUND = 'Page not found · Grievers Guidance';

/** [path opened, path it settles on, title]. With the editor on, `/` and the sign-in paths land on the latest person. */
const EDITOR_ON: [string, string, string][] = [
  ['/', PERSON, OVERVIEW],
  ['/sign-in', PERSON, OVERVIEW],
  ['/sign-up', PERSON, OVERVIEW],
  ['/join', PERSON, OVERVIEW],
  ['/people', '/people', 'Your people · Grievers Guidance'],
  [PERSON, PERSON, OVERVIEW],
  [`${PERSON}/person`, `${PERSON}/person`, 'The person · Grievers Guidance'],
  [`${PERSON}/announcement`, `${PERSON}/announcement`, 'Announcement · Grievers Guidance'],
  [`${PERSON}/service`, `${PERSON}/service`, 'Service · Grievers Guidance'],
  [`${PERSON}/obituary`, `${PERSON}/obituary`, 'Obituary · Grievers Guidance'],
  [`${PERSON}/thanks`, `${PERSON}/thanks`, 'Thank-yous · Grievers Guidance'],
  [`${PERSON}/guide/officiant`, `${PERSON}/guide/officiant`, 'Checklist · Grievers Guidance'],
  // Someone is saved, so the empty pages walk on to them.
  ['/start', PERSON, OVERVIEW],
  ['/start/service', `${PERSON}/service`, 'Service · Grievers Guidance'],
  ['/start/guide/officiant', PERSON, OVERVIEW],
  ['/account', '/account', 'Your account · Grievers Guidance'],
  ['/nope', '/nope', NOT_FOUND],
];

/** With the editor off, the editor's paths show NotFound and the rest show Home at `/`. */
const EDITOR_OFF: [string, string, string][] = EDITOR_ON.map(([path]) => {
  const home = ['/', '/sign-in', '/sign-up', '/join'].includes(path);
  return [path, home ? '/' : path, home ? 'Grievers Guidance' : NOT_FOUND];
});

async function settlesOn(path: string, title: string) {
  await waitFor(() => {
    expect(window.location.pathname).toBe(path);
    expect(document.title).toBe(title);
  });
  await screen.findByRole('heading', { level: 1 });
}

describe('no title ever holds a person\'s name (#852)', () => {
  beforeEach(() => {
    mocks.auth = false;
    seedMargaret();
  });

  it.each(EDITOR_ON)('editor on: %s settles on %s as "%s"', async (path, shown, title) => {
    mocks.cms = true;
    renderApp(<App />, { path });
    await settlesOn(shown, title);
    expect(document.title).not.toMatch(/Margaret|Hayes/);
  });

  it.each(EDITOR_OFF)('editor off: %s settles on %s as "%s"', async (path, shown, title) => {
    mocks.cms = false;
    renderApp(<App />, { path });
    await settlesOn(shown, title);
    expect(document.title).not.toMatch(/Margaret|Hayes/);
  });

  it('accounts on, working locally on this device: the person\'s page keeps a generic title', async () => {
    mocks.cms = true;
    mocks.auth = true;
    mocks.loadClerk.mockResolvedValue({ available: false });
    window.localStorage.setItem('gg.signedIn.v1', 'u1');
    renderApp(<App />, { path: '/people' });
    await settlesOn('/people', 'Your people · Grievers Guidance');
    // The person is on the page, so a title built from the page would show the name.
    expect(await screen.findByText(/Margaret Hayes/)).toBeInTheDocument();
    expect(document.title).not.toMatch(/Margaret|Hayes/);
  });

  it('accounts on, signed out: a person\'s page goes to Sign in, titled Sign in', async () => {
    mocks.cms = true;
    mocks.auth = true;
    mocks.loadClerk.mockResolvedValue(fakeClerk().load);
    renderApp(<App />, { path: `${PERSON}/service` });
    await settlesOn('/sign-in', 'Sign in · Grievers Guidance');
    expect(document.title).not.toMatch(/Margaret|Hayes/);
  });

  it('Your people names them on screen, while the title stays generic', async () => {
    mocks.cms = true;
    renderApp(<App />, { path: '/people' });
    await screen.findByRole('heading', { level: 1, name: 'Your people' });
    // The name is on the page, so a title built from the page's person would show it.
    expect(document.body.textContent).toContain('Margaret Hayes');
    expect(document.title).toBe('Your people · Grievers Guidance');
  });
});
