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
});
