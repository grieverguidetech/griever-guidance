/**
 * #852: one generic tab title per route, and never a person's name. The unit half checks the table;
 * the integration half renders the real App over the real route table with a person named Margaret
 * saved on this device, at every route, and reads `document.title`.
 */
import { render, screen } from '@testing-library/react';
import { renderApp } from '../test/renderApp';
import { titleForPath, useDocumentTitle } from './useDocumentTitle';

const mocks = vi.hoisted(() => ({ cms: true }));

vi.mock('../lib/features', () => ({
  AUTH_ENABLED: false,
  OBITUARY_DRAFTING_ENABLED: false,
  PAYMENTS_ENABLED: false,
  SHARING_ENABLED: false,
}));
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
    ['/sign-up', 'Sign in · Grievers Guidance'],
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

const EVERY_ROUTE = [
  '/',
  '/sign-in',
  '/sign-up',
  '/join',
  '/people',
  `/people/${FLOW}`,
  `/people/${FLOW}/person`,
  `/people/${FLOW}/announcement`,
  `/people/${FLOW}/service`,
  `/people/${FLOW}/obituary`,
  `/people/${FLOW}/thanks`,
  `/people/${FLOW}/guide/officiant`,
  '/start',
  '/start/service',
  '/start/guide/officiant',
  '/account',
  '/nope',
];

describe('no title ever holds a person\'s name (#852)', () => {
  beforeEach(() => {
    seedMargaret();
  });

  it.each(EVERY_ROUTE)('editor on: %s', async (path) => {
    mocks.cms = true;
    renderApp(<App />, { path });
    await screen.findByRole('heading', { level: 1 });
    // Let the App's own replace moves (`/` to the latest person, sign-in to `/`) settle.
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(document.title).not.toMatch(/Margaret|Hayes/);
    // The title is set for the page actually shown, so this is not passing on an empty title.
    expect(document.title).toContain('Grievers Guidance');
  });

  it.each(EVERY_ROUTE)('editor off: %s', async (path) => {
    mocks.cms = false;
    renderApp(<App />, { path });
    await screen.findByRole('heading', { level: 1 });
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(document.title).not.toMatch(/Margaret|Hayes/);
    expect(document.title).toContain('Grievers Guidance');
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
