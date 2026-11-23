import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { v2 } from '@griever/tokens';

const html = readFileSync(resolve(__dirname, '../index.html'), 'utf8');
const css = readFileSync(resolve(__dirname, 'styles.css'), 'utf8');

const theme = readFileSync(resolve(__dirname, 'theme.generated.css'), 'utf8');

/** The declarations of every rule whose selector matches exactly, joined. */
function rule(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const blocks = [...css.matchAll(new RegExp(`(?:^|\\n)\\s*${escaped}\\s*\\{([^}]*)\\}`, 'g'))];
  if (blocks.length === 0) {
    throw new Error(`No rule for ${selector}`);
  }
  return blocks.map((block) => block[1]).join('\n');
}

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      return sourceFiles(path);
    }
    return /\.(tsx?|css)$/.test(entry.name) && entry.name !== 'theme.generated.css' && !entry.name.endsWith('.spec.ts') && !entry.name.endsWith('.spec.tsx')
      ? [path]
      : [];
  });
}

function luminance(hex: string): number {
  const channels = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function contrast(a: string, b: string): number {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (light + 0.05) / (dark + 0.05);
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

  it('defines every var the type rules use (theme.generated.css or the :root block)', () => {
    const rules = ['body', 'h1, h2, h3, h4, h5, h6', 'h1', '.gg-eyebrow', '.gg-card-kicker'].map(rule).join('\n');
    const used = [...rules.matchAll(/var\((--[\w-]+)\)/g)].map((m) => m[1]);
    expect(used.length).toBeGreaterThan(0);
    for (const name of new Set(used)) {
      expect(`${theme}\n${css}`, name).toMatch(new RegExp(`${name}:`));
    }
  });

  it('has no font-serif class anywhere in apps/web/src', () => {
    const offenders = sourceFiles(__dirname).filter((file) => /font-serif/.test(readFileSync(file, 'utf8')) && !file.endsWith('v2Styles.spec.ts'));
    expect(offenders).toEqual([]);
  });

  it('keeps the eyebrow colour at 4.5:1 or more on --color-surface', () => {
    const surface = /--color-surface:\s*(#[0-9a-f]{6})/i.exec(theme)?.[1];
    expect(surface).toBeDefined();
    expect(contrast(v2.roles.eyebrow.color, surface as string)).toBeGreaterThanOrEqual(4.5);
  });
});
