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

  it('level 1 is weight 300 and level 2 is weight 400 on web', () => {
    render(
      <>
        <Heading level={1}>Big</Heading>
        <Heading level={2}>Smaller</Heading>
      </>,
    );
    expect(getComputedStyle(screen.getByRole('heading', { level: 1 })).fontWeight).toBe('300');
    expect(getComputedStyle(screen.getByRole('heading', { level: 2 })).fontWeight).toBe('400');
  });
});
