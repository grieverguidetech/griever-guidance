import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { NotFound } from './NotFound';

describe('NotFound', () => {
  it('shows a calm heading, focuses it, and links back', () => {
    document.title = 'Before';
    const { unmount } = render(
      <MemoryRouter>
        <NotFound />
      </MemoryRouter>,
    );
    const heading = screen.getByRole('heading', { level: 1, name: "We couldn't find that page." });
    expect(heading).toHaveFocus();
    expect(screen.getByRole('link', { name: 'Go to the start page' })).toHaveAttribute('href', '/');
    expect(document.title).toBe('Page not found · Grievers Guidance');
    expect(document.body.textContent).not.toContain('!');
    unmount();
    expect(document.title).toBe('Before');
  });
});
