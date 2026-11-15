import { render, screen } from '@testing-library/react';
import { RouterProvider, createMemoryRouter } from 'react-router';
import { routes } from './router';

vi.mock('../app/app', () => ({ default: () => <p>the app</p> }));

function visit(path: string) {
  render(<RouterProvider router={createMemoryRouter(routes, { initialEntries: [path] })} />);
}

describe('routes', () => {
  it.each(['/', '/sign-in', '/join'])('%s renders the App', (path) => {
    visit(path);
    expect(screen.getByText('the app')).toBeInTheDocument();
  });

  it.each(['/nope', '/people', '/sign-in/extra'])('%s renders NotFound for now', (path) => {
    visit(path);
    expect(screen.getByRole('heading', { level: 1, name: "We couldn't find that page." })).toBeInTheDocument();
    expect(screen.queryByText('the app')).not.toBeInTheDocument();
  });
});
