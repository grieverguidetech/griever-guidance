/**
 * #849 (R2a): the editor's person pages have URLs. The real App over the real route table and real
 * localStorage; the editor flag is mocked per test. Auth and sync are off here (see flowSync.spec for
 * the first-pull wait).
 */
import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderApp } from '../test/renderApp';

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

import { App } from './app';

const FLOW = '3f2b8c1e-9d4a-4c7e-b1f0-2a6d5e8c9b10';
const OTHER = '9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d';

function seed() {
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

function h1(name: string) {
  return screen.findByRole('heading', { level: 1, name });
}

function nav() {
  return within(screen.getByRole('navigation', { name: /^Sections/ }));
}

beforeEach(() => {
  mocks.cms = true;
  seed();
});

describe('editor URLs (#849)', () => {
  it('a deep link opens that section instead of the landing, and a reload stays there', async () => {
    const view = renderApp(<App />, { path: `/people/${FLOW}/service` });
    expect(await h1('Service')).toBeInTheDocument();
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(window.location.pathname).toBe(`/people/${FLOW}/service`);
    view.unmount();
    renderApp(<App />, { path: window.location.pathname });
    expect(await h1('Service')).toBeInTheDocument();
    expect(window.location.pathname).toBe(`/people/${FLOW}/service`);
  });

  it('`/` is replaced by the latest person\'s Overview, with no new history entry', async () => {
    const before = window.history.length;
    renderApp(<App />);
    await h1('Overview');
    await waitFor(() => expect(window.location.pathname).toBe(`/people/${FLOW}`));
    expect(window.history.length).toBe(before);
  });

  it('the side nav links name the person by flowId, never the local id or the name, and mark the page', async () => {
    renderApp(<App />, { path: `/people/${FLOW}/obituary` });
    await h1('Obituary');
    const hrefs = nav()
      .getAllByRole('link')
      .map((link) => link.getAttribute('href'));
    expect(hrefs).toEqual([
      `/people/${FLOW}`,
      `/people/${FLOW}/announcement`,
      `/people/${FLOW}/service`,
      `/people/${FLOW}/obituary`,
      `/people/${FLOW}/thanks`,
    ]);
    expect(hrefs.join(' ')).not.toMatch(/s-local-1|Margaret/);
    expect(nav().getByRole('link', { name: /^Obituary/ })).toHaveAttribute('aria-current', 'page');
  });

  it('Back and Forward walk the real URLs across sections, with focus on the h1', async () => {
    const user = userEvent.setup();
    renderApp(<App />);
    await h1('Overview');
    await user.click(nav().getByRole('link', { name: /^Service/ }));
    await h1('Service');
    expect(window.location.pathname).toBe(`/people/${FLOW}/service`);
    await user.click(nav().getByRole('link', { name: /^Obituary/ }));
    await h1('Obituary');
    expect(window.location.pathname).toBe(`/people/${FLOW}/obituary`);
    act(() => {
      window.history.back();
    });
    const service = await h1('Service');
    expect(window.location.pathname).toBe(`/people/${FLOW}/service`);
    await waitFor(() => expect(service).toHaveFocus());
    act(() => {
      window.history.forward();
    });
    const obituary = await h1('Obituary');
    expect(window.location.pathname).toBe(`/people/${FLOW}/obituary`);
    await waitFor(() => expect(obituary).toHaveFocus());
  });

  it('choosing the page already open adds no history entry', async () => {
    const user = userEvent.setup();
    renderApp(<App />, { path: `/people/${FLOW}/service` });
    await h1('Service');
    const before = window.history.length;
    await user.click(nav().getByRole('link', { name: /^Service/ }));
    expect(window.history.length).toBe(before);
  });

  it('a person who is not on this device: Your people with a calm line, the id gone from the page and the address', async () => {
    renderApp(<App />, { path: `/people/${OTHER}/service` });
    expect(await h1('Your people')).toBeInTheDocument();
    expect(screen.getByText("That page isn't here. Your people are below.")).toBeInTheDocument();
    expect(window.location.pathname).toBe('/');
    expect(document.body.textContent).not.toContain(OTHER);
    expect(screen.getByRole('button', { name: 'Margaret Hayes' })).toBeInTheDocument();
  });

  it('with the editor off, a person page is not found', async () => {
    mocks.cms = false;
    renderApp(<App />, { path: `/people/${FLOW}` });
    expect(await h1("We couldn't find that page.")).toBeInTheDocument();
  });
});
