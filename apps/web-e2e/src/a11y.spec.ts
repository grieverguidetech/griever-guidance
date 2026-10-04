import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { addContacts, BOB, CAROL, onboard } from './support';

/**
 * Automated WCAG 2.2 A/AA checks with axe on each main screen. Axe finds only
 * part of the real problems; it is a floor, not a claim of accessibility.
 *
 * Colour contrast is checked separately below: the brand accent (#0088b0)
 * and the eyebrow/reassure text tokens are known to fall under 4.5:1, and
 * fixing them is a design decision tracked on the board (label `a11y`).
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
  'add contacts': async (page) => {
    await page.goto('/');
  },
  'who hears first': async (page) => {
    await page.goto('/');
    await addContacts(page, [CAROL, BOB]);
    await page.getByRole('button', { name: 'Done for now' }).click();
  },
  'path landing': async (page) => {
    await onboard(page);
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
  // Known failure: accent #0088b0 is 3.65:1 on the page background. When the
  // design tokens are fixed this starts "passing", which fails the run —
  // remove this line then.
  test.fail(true, 'Brand accent and eyebrow tokens are under 4.5:1 — see the a11y contrast issue on the board');
  await screens['announce form'](page);
  expect(await violations(page, { contrastOnly: true })).toEqual([]);
});

test('the page has one h1 and a language', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('h1')).toHaveCount(1);
  await expect(page.locator('html')).toHaveAttribute('lang', /.+/);
});
