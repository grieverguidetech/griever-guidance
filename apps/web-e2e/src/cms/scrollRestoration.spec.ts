import { expect, test, type Page } from '@playwright/test';

/**
 * #852: a new page starts at the top, and Back puts the page where it was. Editor on (the person
 * pages have URLs), through playwright.cms.config.ts. A short window, so the Service page is taller
 * than the view and there is somewhere to scroll.
 */
test.use({ viewport: { width: 1280, height: 480 } });

function scrollY(page: Page) {
  return page.evaluate(() => Math.round(window.scrollY));
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

  // Forward: Obituary comes back at the top, where it was left.
  await page.goForward();
  await expect(page.getByRole('heading', { level: 1, name: 'Obituary' })).toBeVisible();
  await expect.poll(() => scrollY(page)).toBe(0);
});
