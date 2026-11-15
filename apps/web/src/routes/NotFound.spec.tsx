import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { NotFound } from './NotFound';

describe('NotFound', () => {
  it('shows a calm heading, focuses it, and links back', () => {
    render(
      <MemoryRouter>
        <NotFound />
      </MemoryRouter>,
    );
    const heading = screen.getByRole('heading', { level: 1, name: "We couldn't find that page." });
    expect(heading).toHaveFocus();
    expect(screen.getByRole('link', { name: 'Your people' })).toHaveAttribute('href', '/');
    expect(document.body.textContent).not.toContain('!');
  });
});
