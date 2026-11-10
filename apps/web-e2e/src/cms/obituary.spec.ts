import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

/**
 * The obituary fields, the memorial and the Ready block (#782, parent #764). Runs only through
 * playwright.cms.config.ts (flag-on build), so today it runs on desktop Chrome only (#431).
 */
const WCAG = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

const BLOCKED = 'Some placeholder text is still in [brackets]. Replace it before you mark this ready.';

async function violations(page: Page, { contrastOnly = false } = {}) {
  const builder = new AxeBuilder({ page });
  if (contrastOnly) {
    builder.withRules(['color-contrast']);
  } else {
    builder.withTags(WCAG).disableRules(['color-contrast']);
  }
  const { violations } = await builder.analyze();
  return violations.map((v) => `${v.id} (${v.impact}): ${v.nodes.length} node(s) — ${v.help}`);
}

/** Auth is off in this build; with nobody saved, starting a person opens The person. */
async function openObituary(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: "Start with someone I've lost" }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'The person' })).toBeVisible();
  await page.getByLabel('Their name').fill('Margaret Hayes');
  await page.getByRole('navigation').getByRole('button', { name: /^Obituary/ }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Obituary' })).toBeVisible();
}

const obituary = (page: Page) => page.getByRole('textbox', { name: 'Obituary', exact: true });
const memorial = (page: Page) => page.getByRole('textbox', { name: 'Memorial', exact: true });
const markReady = (page: Page) => page.getByRole('button', { name: 'Mark as ready' });

/** Fills the name, life and survivor fields, adds the memorial, and presses Mark as ready with placeholders left. */
async function fillFieldsAndAddMemorial(page: Page) {
  await page.getByRole('button', { name: 'Use the name from The person' }).click();
  await page.getByLabel('Age (optional)').fill('87');
  await page.getByLabel('City where they lived (optional)').fill('Springfield');
  await page.getByLabel('State where they lived (optional)').fill('Illinois');

  const survivors = page.getByRole('group', { name: 'Survived by', exact: true });
  await survivors.getByRole('button', { name: 'Add a person' }).click();
  await survivors.getByLabel('Name, person 1', { exact: true }).fill('John Hayes');
  await survivors.getByLabel('City, person 1', { exact: true }).fill('Austin');

  await page.getByRole('button', { name: 'Add Memorial' }).click();
  await markReady(page).click();
}

test.describe('Obituary section (WEB-6)', () => {
  test('fields fill the text, the memorial is added, and Ready is refused until no placeholder is left', async ({ page }) => {
    await openObituary(page);

    // Nothing typed yet: the name from The person is in paragraph 1, the rest are placeholders.
    await expect(obituary(page)).toHaveValue(/^Margaret Hayes, \[AGE\], of \[CITY\], \[STATE\], passed away on/);
    await expect(page.getByLabel('Given name (optional)')).toHaveValue('');

    await page.getByRole('button', { name: 'Use the name from The person' }).click();
    await expect(page.getByLabel('Given name (optional)')).toHaveValue('Margaret');
    await expect(page.getByLabel('Middle name or nickname (optional)')).toHaveValue('');
    await expect(page.getByLabel('Surname (optional)')).toHaveValue('Hayes');

    await page.getByLabel('Age (optional)').fill('87');
    await page.getByLabel('City where they lived (optional)').fill('Springfield');
    await page.getByLabel('State where they lived (optional)').fill('Illinois');
    await expect(obituary(page)).toHaveValue(/^Margaret Hayes, 87, of Springfield, Illinois, passed away on/);

    // No survivor yet: paragraph 4 keeps its placeholder. One row changes it.
    await expect(obituary(page)).toHaveValue(/Margaret is survived by \[his\/her\] \[RELATION\], \[SURVIVOR NAME\] of \[SURVIVOR CITY\]\./);
    const survivors = page.getByRole('group', { name: 'Survived by', exact: true });
    await survivors.getByRole('button', { name: 'Add a person' }).click();
    await expect(survivors.getByLabel('Name, person 1', { exact: true })).toBeFocused();
    await survivors.getByLabel('Name, person 1', { exact: true }).fill('John Hayes');
    await survivors.getByLabel('City, person 1', { exact: true }).fill('Austin');
    await expect(obituary(page)).toHaveValue(/Margaret is survived by \[his\/her\] spouse, John Hayes of Austin\./);

    // The memorial is its own box, added on request.
    await expect(memorial(page)).toHaveCount(0);
    await page.getByRole('button', { name: 'Add Memorial' }).click();
    await expect(memorial(page)).toBeVisible();
    await expect(memorial(page)).toBeFocused();
    await expect(memorial(page)).toHaveValue(/^Memorial donations may be made to \[ORGANIZATION NAME\]/);
    await expect(page.getByRole('button', { name: 'Add Memorial' })).toHaveCount(0);

    // Placeholders are left in both boxes: Ready is refused and says why.
    const toggle = markReady(page);
    await expect(toggle).toHaveAttribute('aria-disabled', 'true');
    await expect(page.getByText(BLOCKED).first()).toBeVisible();
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-pressed', 'false');
    await expect(toggle).toHaveAttribute('aria-disabled', 'true');
    await expect(page.getByText(BLOCKED).first()).toBeVisible();

    // Typed text without the template words, in the obituary only: the memorial still blocks Ready.
    await obituary(page).fill(
      'Margaret Hayes, 87, of Springfield, Illinois, passed away on May 29, 2026. She was loved by everyone who knew her.\n\nMargaret is survived by her husband, John Hayes of Austin.',
    );
    await expect(toggle).toHaveAttribute('aria-disabled', 'true');

    // Both boxes typed in full: Ready turns on.
    await memorial(page).fill('Memorial donations may be made to the Springfield Library, 12 Main Street, Springfield. The family thanks the nurses at Mercy Hospital.');
    await expect(toggle).not.toHaveAttribute('aria-disabled');
    await expect(page.getByText(BLOCKED)).toHaveCount(0);
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  });

  test('no WCAG A/AA violations with the fields filled, the memorial open and the Ready message showing (contrast checked separately)', async ({ page }) => {
    await openObituary(page);
    await fillFieldsAndAddMemorial(page);
    await expect(page.getByText(BLOCKED).first()).toBeVisible();
    expect(await violations(page)).toEqual([]);
  });

  test('text meets AA contrast with the Ready message showing', async ({ page }) => {
    await openObituary(page);
    await fillFieldsAndAddMemorial(page);
    await expect(page.getByText(BLOCKED).first()).toBeVisible();
    expect(await violations(page, { contrastOnly: true })).toEqual([]);
  });
});
