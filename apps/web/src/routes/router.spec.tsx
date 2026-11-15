import { act, render, screen } from '@testing-library/react';
import { RouterProvider, createMemoryRouter } from 'react-router';
import { routes } from './router';

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
  it.each(['/', '/sign-in', '/sign-up', '/join'])('%s renders the App', (path) => {
    visit(path);
    expect(screen.getByText('the app')).toBeInTheDocument();
  });

  it.each(['/nope', '/people', '/sign-in/extra'])('%s renders NotFound for now', (path) => {
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
