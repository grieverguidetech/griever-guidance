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
const SECOND = 'b1c2d3e4-f5a6-4b7c-8d9e-0f1a2b3c4d5e';
const MISSING_LINE = "That page isn't here. Your people are below.";
const OTHER = '9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d';

function personRecord(id: string, flowId: string, personName: string, openedAt = '2026-10-10T00:00:00.000Z') {
  return {
    id,
    flowId,
    personName,
    dateOfPassing: '',
    senderName: 'Anna',
    obituaryUrl: '',
    createdAt: openedAt,
    lastOpenedAt: openedAt,
    drafts: {},
    draftsUpdatedAt: {},
    serviceReady: false,
    recipientsNotified: {},
    momentCompletedAt: {},
    remindersScheduled: [],
  };
}

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

  it('a person not on this device: the line is said once from a polite region that was already there (#849 a11y)', async () => {
    renderApp(<App />, { path: `/people/${OTHER}` });
    await h1('Your people');
    const visible = screen.getByText(MISSING_LINE, { selector: 'p' });
    expect(visible).not.toHaveAttribute('role');
    const regions = () => screen.getAllByRole('status').filter((region) => region.getAttribute('aria-live') === 'polite');
    await waitFor(() => expect(regions().some((region) => region.textContent === MISSING_LINE)).toBe(true));
  });

  it('a person removed on this device: Your people, with no "not here" line (#849 S3)', async () => {
    window.localStorage.setItem('gg.removedFlows.v1', JSON.stringify([{ id: OTHER, ownerId: null }]));
    renderApp(<App />, { path: `/people/${OTHER}/service` });
    expect(await h1('Your people')).toBeInTheDocument();
    await new Promise((resolve) => setTimeout(resolve, 150));
    expect(screen.queryByText(MISSING_LINE)).toBeNull();
    expect(window.location.pathname).toBe('/');
  });

  it('moving between two people on the same section moves focus to the h1 (#849 a11y)', async () => {
    window.localStorage.setItem(
      'gg.sessions.v1',
      JSON.stringify([personRecord('s-1', FLOW, 'Margaret Hayes'), personRecord('s-2', SECOND, 'Harold Price', '2026-10-01T00:00:00.000Z')]),
    );
    const user = userEvent.setup();
    renderApp(<App />, { path: `/people/${FLOW}/service` });
    await h1('Service');
    await user.click(screen.getAllByRole('textbox')[0]);
    expect(screen.getByRole('heading', { level: 1 })).not.toHaveFocus();
    act(() => {
      window.history.pushState(null, '', `/people/${SECOND}/service`);
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    expect(await screen.findByRole('navigation', { name: 'Sections for Harold Price' })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('heading', { level: 1, name: 'Service' })).toHaveFocus());
  });
});

describe('leaving an unnamed new person (#849 B1)', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  async function startUnnamed(user: ReturnType<typeof userEvent.setup>) {
    renderApp(<App />);
    await user.click(await screen.findByRole('button', { name: "Start with someone I've lost" }));
    await h1('The person');
  }

  it('Start, then Your people: the list, with no "not here" line', async () => {
    const user = userEvent.setup();
    await startUnnamed(user);
    await user.click(nav().getByRole('button', { name: 'Your people' }));
    expect(await h1('Your people')).toBeInTheDocument();
    await new Promise((resolve) => setTimeout(resolve, 150));
    expect(screen.queryByText(MISSING_LINE)).toBeNull();
    expect(screen.getByRole('heading', { level: 1, name: 'Your people' })).toBeInTheDocument();
  });

  it('Start, then Your account: lands on Account', async () => {
    const user = userEvent.setup();
    await startUnnamed(user);
    await user.click(nav().getByRole('button', { name: 'Your account' }));
    expect(await h1('Account')).toBeInTheDocument();
    await new Promise((resolve) => setTimeout(resolve, 150));
    expect(screen.getByRole('heading', { level: 1, name: 'Account' })).toBeInTheDocument();
    expect(screen.queryByText(MISSING_LINE)).toBeNull();
  });
});

describe('the e2e steps of "a typed name reaches the Overview" (#849 CI failure)', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('Start, a name, the Overview link: the Overview; a reload on Service stays on Service', async () => {
    const user = userEvent.setup();
    const first = renderApp(<App />);
    await user.click(await screen.findByRole('button', { name: "Start with someone I've lost" }));
    await h1('The person');
    await user.type(screen.getByLabelText('Their name'), 'Margaret Hayes');
    await user.click(nav().getByRole('link', { name: /^Overview/ }));
    expect(await h1('Overview')).toBeInTheDocument();
    expect(screen.getAllByText('Margaret Hayes').length).toBeGreaterThan(0);
    await user.click(nav().getByRole('link', { name: /^Service/ }));
    await h1('Service');
    const servicePath = window.location.pathname;
    // A reload: the same address opens the same page (the old e2e expected the Overview here).
    first.unmount();
    renderApp(<App />, { path: servicePath });
    expect(await h1('Service')).toBeInTheDocument();
    await user.click(nav().getByRole('link', { name: /^Overview/ }));
    await h1('Overview');
    expect(screen.getAllByText('Margaret Hayes').length).toBeGreaterThan(0);
  });
});

describe('checklist items and the empty pages have URLs (#856)', () => {
  const ITEM = 'Get a legal pronouncement of death';

  beforeEach(() => {
    window.localStorage.clear();
  });

  function panel() {
    return within(screen.getByRole('complementary', { name: "What you'll need" }));
  }

  it('open an item from Service, close it: back on Service, focus on the item that opened it', async () => {
    seed();
    const user = userEvent.setup();
    renderApp(<App />, { path: `/people/${FLOW}/service` });
    await h1('Service');
    const opener = panel().getByRole('button', { name: ITEM });
    await user.click(opener);
    await h1(ITEM);
    expect(window.location.pathname).toBe(`/people/${FLOW}/guide/pronouncement`);
    await user.click(screen.getByRole('button', { name: 'Back' }));
    await h1('Service');
    expect(window.location.pathname).toBe(`/people/${FLOW}/service`);
    await waitFor(() => expect(opener).toHaveFocus());
    await act(async () => {});
    expect(opener).toHaveFocus();
  });

  it('the browser Back button closes the item the same way, and Forward opens it again', async () => {
    seed();
    const user = userEvent.setup();
    renderApp(<App />, { path: `/people/${FLOW}/service` });
    await h1('Service');
    await user.click(panel().getByRole('button', { name: ITEM }));
    await h1(ITEM);
    act(() => window.history.back());
    await h1('Service');
    expect(window.location.pathname).toBe(`/people/${FLOW}/service`);
    act(() => window.history.forward());
    await h1(ITEM);
    expect(window.location.pathname).toBe(`/people/${FLOW}/guide/pronouncement`);
  });

  it('an item opened by a link or a reload closes to the Overview, replacing its own entry', async () => {
    seed();
    const user = userEvent.setup();
    renderApp(<App />, { path: `/people/${FLOW}/guide/pronouncement` });
    await h1(ITEM);
    const before = window.history.length;
    await user.click(screen.getByRole('button', { name: 'Back' }));
    await h1('Overview');
    expect(window.location.pathname).toBe(`/people/${FLOW}`);
    expect(window.history.length).toBe(before);
  });

  it('item A, then item B, then Back, then Back: one Back leaves the items, the next ends where it began, focus on A (#856)', async () => {
    seed();
    const user = userEvent.setup();
    renderApp(<App />, { path: `/people/${FLOW}/service` });
    await h1('Service');
    const rows = Array.from(document.querySelectorAll<HTMLElement>('aside [data-checklist-item]'));
    const [first, second] = rows;
    expect(first.getAttribute('data-checklist-item')).not.toBe(second.getAttribute('data-checklist-item'));
    const firstId = first.getAttribute('data-checklist-item');
    await user.click(first);
    await screen.findByRole('heading', { level: 1, name: /\S/ });
    const secondRow = document.querySelector<HTMLElement>(`aside [data-checklist-item="${second.getAttribute('data-checklist-item')}"]`);
    await user.click(secondRow as HTMLElement);
    await waitFor(() => expect(window.location.pathname).toBe(`/people/${FLOW}/guide/${second.getAttribute('data-checklist-item')}`));
    // The second item took the first one's entry: one Back leaves both.
    await user.click(screen.getByRole('button', { name: 'Back' }));
    await h1('Service');
    expect(window.location.pathname).toBe(`/people/${FLOW}/service`);
    // Focus goes to the row of the FIRST item, which is still on the page.
    const firstNow = document.querySelector<HTMLElement>(`aside [data-checklist-item="${firstId}"]`);
    await waitFor(() => expect(firstNow).toHaveFocus());
    await act(async () => {});
    expect(firstNow).toHaveFocus();
  });

  it('an item entry that carries our marker (a reload) still closes Back to the page before it', async () => {
    seed();
    const user = userEvent.setup();
    window.history.replaceState(null, '', `/people/${FLOW}/service`);
    // React Router's own state shape on an entry: `usr` is our state, `key` the entry key, `idx` its position.
    window.history.pushState({ usr: { openedHere: true }, key: 'reloaded', idx: 1 }, '', `/people/${FLOW}/guide/pronouncement`);
    renderApp(<App />, { path: `/people/${FLOW}/guide/pronouncement` });
    await h1(ITEM);
    await user.click(screen.getByRole('button', { name: 'Back' }));
    await h1('Service');
    expect(window.location.pathname).toBe(`/people/${FLOW}/service`);
  });

  it('a second tap on Back before the page has changed does not go Back again', async () => {
    seed();
    const user = userEvent.setup();
    renderApp(<App />, { path: `/people/${FLOW}/service` });
    await h1('Service');
    await user.click(panel().getByRole('button', { name: ITEM }));
    await h1(ITEM);
    // A slow commit: the history move is held, so the location is still the item's at the second tap.
    const go = vi.spyOn(window.history, 'go').mockImplementation(() => undefined);
    try {
      const back = screen.getByRole('button', { name: 'Back' });
      await user.click(back);
      await user.click(back);
      expect(window.location.pathname).toBe(`/people/${FLOW}/guide/pronouncement`);
      expect(go.mock.calls.filter(([delta]) => delta === -1)).toHaveLength(1);
    } finally {
      go.mockRestore();
    }
  });

  it('nobody saved: an item opened from Your people closes back to Your people at its own address', async () => {
    const user = userEvent.setup();
    renderApp(<App />, { path: '/start' });
    await h1('Overview');
    await user.click(nav().getByRole('button', { name: 'Your people' }));
    await h1('Your people');
    const before = window.location.pathname;
    await user.click(panel().getByRole('button', { name: ITEM }));
    await h1(ITEM);
    expect(window.location.pathname).toBe('/start/guide/pronouncement');
    await user.click(screen.getByRole('button', { name: 'Back' }));
    await h1('Your people');
    expect(window.location.pathname).toBe(before);
  });

  it('nobody saved: an item opened from Your account closes back to Your account at its own address', async () => {
    const user = userEvent.setup();
    renderApp(<App />, { path: '/start' });
    await h1('Overview');
    await user.click(nav().getByRole('button', { name: 'Your account' }));
    await h1('Account');
    const before = window.location.pathname;
    await user.click(panel().getByRole('button', { name: ITEM }));
    await h1(ITEM);
    await user.click(screen.getByRole('button', { name: 'Back' }));
    await h1('Account');
    expect(window.location.pathname).toBe(before);
  });

  it('a guide path with an item that is not ours is not found, also on /start', async () => {
    renderApp(<App />, { path: '/start/guide/nope' });
    expect(await h1("We couldn't find that page.")).toBeInTheDocument();
  });

  it('with the editor off, /start is not found', async () => {
    mocks.cms = false;
    renderApp(<App />, { path: '/start' });
    expect(await h1("We couldn't find that page.")).toBeInTheDocument();
  });

  it('an item that is not on the checklist is not found', async () => {
    seed();
    renderApp(<App />, { path: `/people/${FLOW}/guide/nope` });
    expect(await h1("We couldn't find that page.")).toBeInTheDocument();
  });

  it('with nobody saved, /start shows the empty Overview and /start/service the empty Service', async () => {
    renderApp(<App />, { path: '/start/service' });
    expect(await h1('Service')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: "Start with someone I've lost" })).toBeInTheDocument();
    expect(window.location.pathname).toBe('/start/service');
  });

  it('an item opened from the empty Service page closes back to it, focus on the item', async () => {
    const user = userEvent.setup();
    renderApp(<App />, { path: '/start/service' });
    await h1('Service');
    const opener = panel().getByRole('button', { name: ITEM });
    await user.click(opener);
    await h1(ITEM);
    expect(window.location.pathname).toBe('/start/guide/pronouncement');
    await user.click(screen.getByRole('button', { name: 'Back' }));
    await h1('Service');
    expect(window.location.pathname).toBe('/start/service');
    await waitFor(() => expect(opener).toHaveFocus());
    await act(async () => {});
    expect(opener).toHaveFocus();
  });

  it('an empty page once someone exists is replaced by that person, with no extra entry (#566)', async () => {
    seed();
    const before = window.history.length;
    renderApp(<App />, { path: '/start/service' });
    await h1('Service');
    await waitFor(() => expect(window.location.pathname).toBe(`/people/${FLOW}/service`));
    expect(window.history.length).toBe(before);
  });

  it('Start on /start makes the person and moves to their page', async () => {
    const user = userEvent.setup();
    renderApp(<App />, { path: '/start' });
    await h1('Overview');
    await user.click(await screen.findByRole('button', { name: "Start with someone I've lost" }));
    await h1('The person');
    expect(window.location.pathname).toMatch(/^\/people\//);
  });
});
