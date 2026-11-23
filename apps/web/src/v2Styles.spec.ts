import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const html = readFileSync(resolve(__dirname, '../index.html'), 'utf8');
const css = readFileSync(resolve(__dirname, 'styles.css'), 'utf8');

/** The declarations of the first rule whose selector matches exactly. */
function rule(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = new RegExp(`(?:^|\\n)\\s*${escaped}\\s*\\{([^}]*)\\}`).exec(css);
  if (!match) {
    throw new Error(`No rule for ${selector}`);
  }
  return match[1];
}

describe('index.html fonts', () => {
  const sora = /family=Sora:wght@([0-9;]+)&display=swap/.exec(html);

  it('loads Sora at 300, 400 and 500 only, with display=swap', () => {
    expect(sora?.[1]).toBe('300;400;500');
  });

  it('has no Source Serif link', () => {
    expect(html).not.toMatch(/Source\+Serif|Source Serif/i);
  });
});

describe('styles.css type roles', () => {
  it('sets the body to Sora regular at the body size, with no font synthesis', () => {
    const body = rule('body');
    expect(body).toContain('font-family: var(--font-v2)');
    expect(body).toContain('font-size: var(--v2-body-size)');
    expect(body).toContain('font-weight: var(--v2-weight-regular)');
    expect(body).toContain('font-synthesis-style: none');
  });

  it('makes h1 light and h2 to h6 regular in the heading colour', () => {
    expect(rule('h1, h2, h3, h4, h5, h6')).toContain('font-weight: var(--v2-weight-regular)');
    expect(rule('h1, h2, h3, h4, h5, h6')).toContain('color: var(--color-v2-heading)');
    expect(rule('h1')).toContain('font-weight: var(--v2-heading-weight)');
  });

  it.each(['.gg-eyebrow', '.gg-card-kicker'])('%s uses the eyebrow size, tracking and colour, uppercase', (selector) => {
    const decl = rule(selector);
    expect(decl).toContain('font-size: var(--v2-eyebrow-size)');
    expect(decl).toContain('letter-spacing: var(--v2-eyebrow-tracking)');
    expect(decl).toContain('text-transform: uppercase');
    expect(decl).toContain('color: var(--color-v2-eyebrow)');
  });

  it('uses no weight above 500 and no serif var', () => {
    expect(css).not.toMatch(/font-weight:\s*(6|7|8|9)00/);
    expect(css).not.toContain('var(--font-serif)');
  });
});
