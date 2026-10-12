import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { addContacts, BOB, CAROL, HOME_HEADING, onboard, startFirstPerson } from './support';

/**
 * Automated WCAG 2.2 A/AA checks with axe on each main screen. Axe finds only
 * part of the real problems; it is a floor, not a claim of accessibility.
 *
 * Colour contrast is checked separately below (the test names say so) so a
 * contrast regression is reported on its own.
 */
const WCAG = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

async function violations(page: Page, { contrastOnly = false } = {}) {
  const builder = new AxeBuilder({ page });
  if (contrastOnly) builder.withRules(['color-contrast']);
  else builder.withTags(WCAG).disableRules(['color-contrast']);
  const { violations } = await builder.analyze();
  return violations.map((v) => `${v.id} (${v.impact}): ${v.nodes.length} node(s) — ${v.help}`);
}

const screens: Record<string, (page: Page) => Promise<void>> = {
  'first-visit home': async (page) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1, name: HOME_HEADING })).toBeVisible();
  },
  'add contacts': async (page) => {
    await startFirstPerson(page);
  },
  'who hears first': async (page) => {
    await startFirstPerson(page);
    await addContacts(page, [CAROL, BOB]);
    await page.getByRole('button', { name: 'Done for now' }).click();
  },
  'path landing': async (page) => {
    await onboard(page);
  },
  home: async (page) => {
    await onboard(page);
    await page.reload();
    await expect(page.getByRole('heading', { level: 1, name: HOME_HEADING })).toBeVisible();
  },
  'announce form': async (page) => {
    await onboard(page);
    await page.getByRole('button', { name: 'Start' }).click();
  },
};

for (const [name, open] of Object.entries(screens)) {
  test(`${name}: no WCAG A/AA violations (contrast checked separately)`, async ({ page }) => {
    await open(page);
    expect(await violations(page)).toEqual([]);
  });
}

test('add contacts: text meets AA contrast', async ({ page }) => {
  await screens['add contacts'](page);
  expect(await violations(page, { contrastOnly: true })).toEqual([]);
});

test('path landing and announce form: text meets AA contrast', async ({ page }) => {
  await screens['announce form'](page);
  expect(await violations(page, { contrastOnly: true })).toEqual([]);
});

test('the page has one h1 and a language', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('h1')).toHaveCount(1);
  await expect(page.locator('html')).toHaveAttribute('lang', /.+/);
});
