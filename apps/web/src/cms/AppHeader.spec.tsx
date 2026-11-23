import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { screen } from '@testing-library/react';
import { renderApp } from '../test/renderApp';
import { PRODUCT_NAME } from '@griever/shared';
import { AppHeader } from './AppHeader';

const webRoot = resolve(__dirname, '../..');

describe('AppHeader', () => {
  it('is a banner that shows only the wordmark, with no link, button or input', () => {
    renderApp(<AppHeader />);
    const banner = screen.getByRole('banner');
    expect(banner.querySelector('button, a, input, img')).toBeNull();
  });

  it('shows the name as real text, once, in the accessible name', () => {
    renderApp(<AppHeader />);
    const banner = screen.getByRole('banner');
    expect(screen.getAllByText(PRODUCT_NAME)).toHaveLength(1);
    expect(banner.textContent).toBe(PRODUCT_NAME);
    expect(screen.queryByRole('img')).toBeNull();
  });

  it('takes the font and colours from v2 variables', () => {
    renderApp(<AppHeader />);
    const name = screen.getByTestId('wordmark-name');
    expect(name.style.fontFamily).toBe('var(--font-v2)');
    expect(name.style.fontWeight).toBe('var(--v2-weight-regular)');
    expect(name.className).toContain('text-[color:var(--color-v2-heading)]');
    const [sun, line] = Array.from(screen.getByRole('banner').querySelectorAll('svg path'));
    expect((sun as SVGElement).style.fill).toBe('var(--color-v2-link)');
    expect((line as SVGElement).style.stroke).toBe('var(--color-v2-heading)');
  });

  it('hides the mark from assistive technology and keeps the name on one line', () => {
    renderApp(<AppHeader />);
    const svg = screen.getByRole('banner').querySelector('svg');
    expect(svg).toHaveAttribute('aria-hidden', 'true');
    expect(svg).toHaveAttribute('focusable', 'false');
    // The name may wrap with large text (no horizontal scroll at 200%); the mark keeps its size.
    expect(screen.getByTestId('wordmark-name').parentElement?.className).not.toContain('whitespace-nowrap');
    expect(screen.getByTestId('wordmark-name').parentElement?.className).toContain('min-w-0');
  });

  it('has no literal colours in the source', () => {
    const src = readFileSync(resolve(__dirname, 'AppHeader.tsx'), 'utf8');
    expect(src).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(src).not.toMatch(/\b(rgb|hsl)a?\(/);
  });
});

describe('AppHeader layout', () => {
  it('has a bottom border in the divider token, padding and space below', () => {
    renderApp(<AppHeader />);
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

  it.each(['mark.svg'])('%s is well-formed SVG', (file) => {
    const svg = readFileSync(resolve(webRoot, 'public/brand', file), 'utf8');
    const doc = new DOMParser().parseFromString(svg, 'image/svg+xml');
    expect(doc.querySelector('parsererror')).toBeNull();
    expect(doc.documentElement.nodeName).toBe('svg');
    expect(svg).not.toMatch(/<script|href=|<foreignObject/i);
  });

  it('no longer ships the old image wordmark', () => {
    expect(existsSync(resolve(webRoot, 'public/brand/wordmark.svg'))).toBe(false);
  });
});
