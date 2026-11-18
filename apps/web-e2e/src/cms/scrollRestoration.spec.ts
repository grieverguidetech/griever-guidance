import { expect, test, type Page } from '@playwright/test';

/**
 * #852: a new page starts at the top, and Back puts the page where it was. Editor on (the person
 * pages have URLs), through playwright.cms.config.ts. A short window, so the Service page is taller
 * than the view and there is somewhere to scroll.
 *
 * Chromium restores scroll on Back by itself, so the scroll checks alone would pass without the
 * feature. The router's own signs are checked too: `history.scrollRestoration` is "manual" (the
 * router took over from the browser), and on leaving the page it stores its positions in
 * sessionStorage under "react-router-scroll-positions".
 */
test.use({ viewport: { width: 1280, height: 480 } });

const POSITIONS_KEY = 'react-router-scroll-positions';

function scrollY(page: Page) {
  return page.evaluate(() => Math.round(window.scrollY));
}

/** The focused element is inside the window, or nothing is focused (the body). */
function focusInView(page: Page) {
  return page.evaluate(() => {
    const el = document.activeElement;
    if (!el || el === document.body) {
      return true;
    }
    const rect = el.getBoundingClientRect();
    return rect.bottom >= 0 && rect.top < window.innerHeight;
  });
}

async function openSection(page: Page, name: string, heading: string) {
  await page.getByRole('navigation').getByRole('link', { name: new RegExp(`^${name}`) }).click();
  await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible();
}

test('Back restores the scroll position, and a new page starts at the top', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1, name: 'Overview' })).toBeVisible();
  await page.getByRole('button', { name: "Start with someone I've lost" }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'The person' })).toBeVisible();
  await page.getByLabel('Their name').fill('Margaret Hayes');
  await openSection(page, 'Service', 'Service');
  // The tab title names the page, never the person (#852).
  await expect(page).toHaveTitle('Service · Grievers Guidance');
  // The router, not the browser, owns scroll restoration.
  expect(await page.evaluate(() => window.history.scrollRestoration)).toBe('manual');

  // Scroll partway down Service. The check below it makes sure the page really moved.
  const target = await page.evaluate(() => {
    const room = document.documentElement.scrollHeight - window.innerHeight;
    return Math.min(300, Math.floor(room / 2));
  });
  expect(target).toBeGreaterThan(100);
  await page.evaluate((y) => window.scrollTo(0, y), target);
  await expect.poll(() => scrollY(page)).toBe(target);

  // A new page starts at the top.
  await openSection(page, 'Obituary', 'Obituary');
  await expect.poll(() => scrollY(page)).toBe(0);

  // Back: Service comes back where it was, not at the top.
  await page.goBack();
  await expect(page.getByRole('heading', { level: 1, name: 'Service' })).toBeVisible();
  await expect.poll(() => scrollY(page)).toBe(target);
  // Focus moved to something in view (the h1 or the side nav's current link), or stayed put. It never
  // pulls the page away from the restored position.
  expect(await focusInView(page)).toBe(true);
  expect(await scrollY(page)).toBe(target);

  // Forward: Obituary comes back at the top, where it was left.
  await page.goForward();
  await expect(page.getByRole('heading', { level: 1, name: 'Obituary' })).toBeVisible();
  await expect.poll(() => scrollY(page)).toBe(0);

  // The router writes its positions to sessionStorage when the page is left (here, a reload), and
  // Service's position is among them.
  await page.goBack();
  await expect(page.getByRole('heading', { level: 1, name: 'Service' })).toBeVisible();
  await expect.poll(() => scrollY(page)).toBe(target);
  await page.reload();
  await expect(page.getByRole('heading', { level: 1, name: 'Service' })).toBeVisible();
  const stored = await page.evaluate((key) => window.sessionStorage.getItem(key), POSITIONS_KEY);
  expect(stored).not.toBeNull();
  expect(Object.values(JSON.parse(stored ?? '{}') as Record<string, number>)).toContain(target);
});
