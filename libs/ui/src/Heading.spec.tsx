import { render, screen } from '@testing-library/react';
import { Heading } from './Heading';
import type { HeadingLevel } from './Heading';

describe('Heading', () => {
  it.each([1, 2, 3, 4, 5, 6] as HeadingLevel[])('level %i is a heading of that level', (level) => {
    render(<Heading level={level}>One thing at a time.</Heading>);
    expect(screen.getByRole('heading', { name: 'One thing at a time.', level })).toBeInTheDocument();
  });

  it('is a real h1 element on web, not a styled div', () => {
    render(<Heading level={1}>Title</Heading>);
    expect(screen.getByRole('heading', { level: 1 }).tagName).toBe('H1');
  });

  it('is a real h3 element for level 3', () => {
    render(<Heading level={3}>Subtitle</Heading>);
    expect(screen.getByRole('heading', { level: 3 }).tagName).toBe('H3');
  });
});
