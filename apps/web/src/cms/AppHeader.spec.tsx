import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { render, screen } from '@testing-library/react';
import { PRODUCT_NAME } from '@griever/shared';
import { AppHeader } from './AppHeader';

const webRoot = resolve(__dirname, '../..');

describe('AppHeader', () => {
  it('is a banner that shows only the wordmark image', () => {
    render(<AppHeader />);
    const banner = screen.getByRole('banner');
    const logo = screen.getByRole('img', { name: PRODUCT_NAME });
    expect(logo).toHaveAttribute('src', '/brand/wordmark.svg');
    expect(banner.querySelector('button, a, input')).toBeNull();
  });
});

describe('AppHeader layout', () => {
  it('has a bottom border in the divider token, padding and space below', () => {
    render(<AppHeader />);
    const cls = screen.getByRole('banner').className;
    expect(cls).toContain('border-b');
    expect(cls).toContain('border-[color:var(--color-divider)]');
    expect(cls).toContain('py-3');
    expect(cls).toContain('mb-6');
  });
});

describe('brand files', () => {
  it('links the SVG favicon and keeps the .ico fallback', () => {
    const html = readFileSync(resolve(webRoot, 'index.html'), 'utf8');
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const svgLink = doc.querySelector('link[rel="icon"][type="image/svg+xml"]');
    expect(svgLink?.getAttribute('href')).toBe('/brand/mark.svg');
    expect(doc.querySelector('link[rel="icon"][href="/favicon.ico"]')).not.toBeNull();
  });

  it.each(['mark.svg', 'wordmark.svg'])('%s is well-formed SVG', (file) => {
    const svg = readFileSync(resolve(webRoot, 'public/brand', file), 'utf8');
    const doc = new DOMParser().parseFromString(svg, 'image/svg+xml');
    expect(doc.querySelector('parsererror')).toBeNull();
    expect(doc.documentElement.nodeName).toBe('svg');
    expect(svg).not.toMatch(/<script|href=|<foreignObject/i);
  });

  it('the header wordmark has no dark-scheme colours, since the page has no dark theme', () => {
    const svg = readFileSync(resolve(webRoot, 'public/brand/wordmark.svg'), 'utf8');
    expect(svg).not.toContain('prefers-color-scheme');
  });

  it('does not squeeze the name: no textLength, and the img ratio matches the viewBox', () => {
    const svg = readFileSync(resolve(webRoot, 'public/brand/wordmark.svg'), 'utf8');
    expect(svg).not.toMatch(/textLength|lengthAdjust/);
    const [, w, h] = /viewBox="0 0 (\d+) (\d+)"/.exec(svg) ?? [];
    render(<AppHeader />);
    const logo = screen.getByRole('img', { name: PRODUCT_NAME });
    expect(Number(logo.getAttribute('width')) / Number(logo.getAttribute('height'))).toBeCloseTo(Number(w) / Number(h), 1);
  });
});
