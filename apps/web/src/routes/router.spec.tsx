import { act, render, screen } from '@testing-library/react';
import { RouterProvider, createMemoryRouter } from 'react-router';
import { routes, scrollKey } from './router';

const mounts = vi.hoisted(() => ({ count: 0 }));
vi.mock('../app/app', async () => {
  const { useEffect } = await import('react');
  return {
    default: () => {
      useEffect(() => {
        mounts.count += 1;
      }, []);
      return <p>the app</p>;
    },
  };
});

function visit(path: string) {
  render(<RouterProvider router={createMemoryRouter(routes, { initialEntries: [path] })} />);
}

describe('routes', () => {
  const FLOW = '3f2b8c1e-9d4a-4c7e-b1f0-2a6d5e8c9b10';

  it.each(['/', '/sign-in', '/sign-in/factor-one', '/sign-up', '/join', `/people/${FLOW}`, `/people/${FLOW}/service`, `/people/${FLOW}/thanks`, `/people/${FLOW}/guide/officiant`, '/start', '/start/service', '/start/guide/officiant', '/people', '/account'])('%s renders the App', (path) => {
    visit(path);
    expect(screen.getByText('the app')).toBeInTheDocument();
  });

  it.each(['/nope', '/account/x', `/people/${FLOW}/nope`, '/start/nope', '/start/guide'])('%s renders NotFound for now', (path) => {
    visit(path);
    expect(screen.getByRole('heading', { level: 1, name: "We couldn't find that page." })).toBeInTheDocument();
    expect(screen.queryByText('the app')).not.toBeInTheDocument();
  });
});

describe('App mounting', () => {
  it('mounts once across / to /sign-in to /join', async () => {
    mounts.count = 0;
    const router = createMemoryRouter(routes, { initialEntries: ['/'] });
    render(<RouterProvider router={router} />);
    await act(() => router.navigate('/sign-in'));
    await act(() => router.navigate('/join'));
    expect(screen.getByText('the app')).toBeInTheDocument();
    expect(mounts.count).toBe(1);
  });
});

describe('route warnings', () => {
  it.each(['/', '/sign-in', '/join', '/people/3f2b8c1e-9d4a-4c7e-b1f0-2a6d5e8c9b10/service'])(
    '%s logs no "leaf route has no element" warning',
    (path) => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      try {
        visit(path);
        const leafWarnings = warn.mock.calls.filter((args) => String(args[0]).includes('does not have an element or Component'));
        expect(leafWarnings).toEqual([]);
      } finally {
        warn.mockRestore();
      }
    },
  );
});

describe('scroll restoration (#852)', () => {
  function scrolledTo(y: number) {
    Object.defineProperty(window, 'scrollY', { configurable: true, value: y });
  }

  afterEach(() => {
    scrolledTo(0);
    vi.restoreAllMocks();
  });

  it('sends a new page to the top and puts Back where it was', async () => {
    const scrollTo = vi.spyOn(window, 'scrollTo');
    const router = createMemoryRouter(routes, { initialEntries: ['/people'] });
    render(<RouterProvider router={router} />);

    // Halfway down Your people, open a person: the new page starts at the top.
    scrolledTo(640);
    scrollTo.mockClear();
    await act(() => router.navigate('/people/3f2b8c1e-9d4a-4c7e-b1f0-2a6d5e8c9b10'));
    expect(scrollTo).toHaveBeenLastCalledWith(0, 0);

    // Back: Your people comes back at 640, not at the top.
    scrolledTo(0);
    scrollTo.mockClear();
    await act(() => router.navigate(-1));
    expect(router.state.location.pathname).toBe('/people');
    expect(scrollTo).toHaveBeenLastCalledWith(0, 640);
  });

  it('a page not found also starts at the top', async () => {
    const scrollTo = vi.spyOn(window, 'scrollTo');
    const router = createMemoryRouter(routes, { initialEntries: ['/people'] });
    render(<RouterProvider router={router} />);
    scrolledTo(300);
    scrollTo.mockClear();
    await act(() => router.navigate('/nope'));
    expect(screen.getByRole('heading', { level: 1, name: "We couldn't find that page." })).toBeInTheDocument();
    expect(scrollTo).toHaveBeenLastCalledWith(0, 0);
  });
});

describe('scroll keys (#852)', () => {
  it('uses the router key, or the path for an entry the router did not make', () => {
    expect(scrollKey({ key: 'a1b2c3', pathname: '/people' })).toBe('a1b2c3');
    expect(scrollKey({ key: 'default', pathname: '/people' })).toBe('/people');
    expect(scrollKey({ key: 'default', pathname: '/sign-in/factor-one' })).toBe('/sign-in/factor-one');
  });

  it('two "default" entries keep their own positions', async () => {
    const scrollTo = vi.spyOn(window, 'scrollTo');
    // Both entries have the key "default", as the page load and Clerk's own entries do.
    const router = createMemoryRouter(routes, {
      initialEntries: [
        { pathname: '/start', key: 'default' },
        { pathname: '/account', key: 'default' },
      ],
    });
    render(<RouterProvider router={router} />);
    expect(router.state.location.key).toBe('default');
    Object.defineProperty(window, 'scrollY', { configurable: true, value: 300 });
    scrollTo.mockClear();
    try {
      await act(() => router.navigate(-1));
      expect(router.state.location.pathname).toBe('/start');
      // Under one shared key, /start would come back at /account's 300. (Positions live in the
      // router module for the whole file, so this test uses paths no other test scrolls.)
      expect(scrollTo).toHaveBeenLastCalledWith(0, 0);
    } finally {
      Object.defineProperty(window, 'scrollY', { configurable: true, value: 0 });
      scrollTo.mockRestore();
    }
  });
});
