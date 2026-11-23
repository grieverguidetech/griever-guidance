import { render, screen } from '@testing-library/react';
import { Platform } from 'react-native';
import { v2 } from '@griever/tokens';
import { Heading, headingColor } from './Heading';
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

  it('uses the v2 heading colour var on web and ink on native', () => {
    expect(headingColor()).toBe('var(--color-v2-heading)');
    vi.spyOn(Platform, 'OS', 'get').mockReturnValue('ios');
    expect(headingColor()).toBe(v2.roles.ink);
    vi.restoreAllMocks();
  });

  it('level 1 uses the v2 heading weight and level 2 the regular weight on web', () => {
    render(
      <>
        <Heading level={1}>Big</Heading>
        <Heading level={2}>Smaller</Heading>
      </>,
    );
    expect(getComputedStyle(screen.getByRole('heading', { level: 1 })).fontWeight).toBe(String(v2.roles.heading.weight));
    expect(getComputedStyle(screen.getByRole('heading', { level: 2 })).fontWeight).toBe(String(v2.primitives.font.weights.regular));
    expect(getComputedStyle(screen.getByRole('heading', { level: 1 })).fontFamily).toContain('var(--font-v2-heading)');
    expect(getComputedStyle(screen.getByRole('heading', { level: 2 })).fontFamily).toContain('var(--font-v2-heading)');
  });
});
