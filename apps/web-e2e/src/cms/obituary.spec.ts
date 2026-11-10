import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

/**
 * The obituary fields, the memorial and the Ready block (#782, parent #764). Runs only through
 * playwright.cms.config.ts (flag-on build), so today it runs on desktop Chrome only (#431).
 */
const WCAG = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

// The start of the message. It goes on to name the Memorial when the Memorial has placeholders.
const BLOCKED = 'Some placeholder text is still in [brackets]';

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

/** The visible red line, not the screen-reader status node that carries the same words. */
const blockedLine = (page: Page) => page.locator('p:not([role="status"])', { hasText: BLOCKED });

/** Playwright's click() waits on an aria-disabled button until the timeout, so press it with the keyboard. Then check the press landed: the status is written only on a blocked press. */
async function pressBlockedMarkReady(page: Page) {
  await markReady(page).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('status').filter({ hasText: BLOCKED })).toHaveCount(1);
}

/** The obituary groups are accordion sections; only the name is open on load. Click the heading button to open one. */
async function openSection(page: Page, name: string) {
  const button = page.getByRole('button', { name, exact: true });
  if ((await button.getAttribute('aria-expanded')) !== 'true') {
    await button.click();
  }
  await expect(button).toHaveAttribute('aria-expanded', 'true');
}

const SECTIONS = [
  "The person's name",
  'Their life',
  'Their family',
  'Service and visitation',
  'Funeral home and place of worship',
  'Survived by',
  'Preceded in death by',
  'Memorial (optional)',
];

async function openAllSections(page: Page) {
  for (const name of SECTIONS) {
    await openSection(page, name);
  }
}

/** Fills the name, life and survivor fields, adds the memorial, and presses Mark as ready with placeholders left. */
async function fillFieldsAndAddMemorial(page: Page) {
  await page.getByRole('button', { name: 'Use the name from The person' }).click();
  await openSection(page, 'Their life');
  await page.getByLabel('Age (optional)').fill('87');
  await page.getByLabel('City where they lived (optional)').fill('Springfield');
  await page.getByLabel('State where they lived (optional)').fill('Illinois');

  await openSection(page, 'Survived by');
  const survivors = page.getByRole('group', { name: 'Survived by', exact: true });
  await survivors.getByRole('button', { name: 'Add a person' }).click();
  await survivors.getByLabel('Name, person 1', { exact: true }).fill('John Hayes');
  await survivors.getByLabel('City, person 1', { exact: true }).fill('Austin');

  await openSection(page, 'Memorial (optional)');
  await page.getByRole('button', { name: 'Add Memorial' }).click();
  await pressBlockedMarkReady(page);
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

    await openSection(page, 'Their life');
    await page.getByLabel('Age (optional)').fill('87');
    await page.getByLabel('City where they lived (optional)').fill('Springfield');
    await page.getByLabel('State where they lived (optional)').fill('Illinois');
    await expect(obituary(page)).toHaveValue(/^Margaret Hayes, 87, of Springfield, Illinois, passed away on/);

    // No survivor yet: paragraph 4 keeps its placeholder. One row changes it.
    await expect(obituary(page)).toHaveValue(/Margaret is survived by \[his\/her\] \[RELATION\], \[SURVIVOR NAME\] of \[SURVIVOR CITY\]\./);
    await openSection(page, 'Survived by');
    const survivors = page.getByRole('group', { name: 'Survived by', exact: true });
    await survivors.getByRole('button', { name: 'Add a person' }).click();
    await expect(survivors.getByLabel('Name, person 1', { exact: true })).toBeFocused();
    await survivors.getByLabel('Name, person 1', { exact: true }).fill('John Hayes');
    await survivors.getByLabel('City, person 1', { exact: true }).fill('Austin');
    await expect(obituary(page)).toHaveValue(/Margaret is survived by \[his\/her\] spouse, John Hayes of Austin\./);

    // The memorial is its own box, added on request.
    await expect(memorial(page)).toHaveCount(0);
    await openSection(page, 'Memorial (optional)');
    await page.getByRole('button', { name: 'Add Memorial' }).click();
    await expect(memorial(page)).toBeVisible();
    await expect(memorial(page)).toBeFocused();
    await expect(memorial(page)).toHaveValue(/^Memorial donations may be made to \[ORGANIZATION NAME\]/);
    await expect(page.getByRole('button', { name: 'Add Memorial' })).toHaveCount(0);

    // Placeholders are left in both boxes: Ready is refused and says why.
    const toggle = markReady(page);
    await expect(toggle).toHaveAttribute('aria-disabled', 'true');
    await expect(blockedLine(page)).toBeVisible();
    await pressBlockedMarkReady(page);
    await expect(toggle).toHaveAttribute('aria-pressed', 'false');
    await expect(toggle).toHaveAttribute('aria-disabled', 'true');
    await expect(blockedLine(page)).toBeVisible();

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
    await openAllSections(page);
    await expect(blockedLine(page)).toBeVisible();
    expect(await violations(page)).toEqual([]);
  });

  test('text meets AA contrast with the Ready message showing', async ({ page }) => {
    await openObituary(page);
    await fillFieldsAndAddMemorial(page);
    await openAllSections(page);
    await expect(blockedLine(page)).toBeVisible();
    expect(await violations(page, { contrastOnly: true })).toEqual([]);
  });

  test('paired fields share a row at 1280px and nothing scrolls sideways at 375px', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await openObituary(page);
    await openSection(page, 'Their life');
    // The panel slides in when it opens, so wait until both inputs have settled on the same row.
    const rowGap = async () => {
      const age = await page.getByLabel('Age (optional)').boundingBox();
      const born = await page.getByLabel('Where they were born (optional)').boundingBox();
      if (!age || !born) {
        return null;
      }
      return Math.abs(age.y - born.y);
    };
    await expect.poll(rowGap).toBe(0);

    // In Service and visitation, the date and time of the service share a row.
    await openSection(page, 'Service and visitation');
    const serviceDate = page.getByLabel('Funeral or memorial service Date', { exact: true });
    const serviceTime = page.getByLabel('Funeral or memorial service Time', { exact: true });
    const dateTimeGap = async () => {
      const a = await serviceDate.boundingBox();
      const b = await serviceTime.boundingBox();
      if (!a || !b) {
        return null;
      }
      return Math.abs(a.y - b.y);
    };
    await expect.poll(dateTimeGap).toBe(0);

    await page.setViewportSize({ width: 375, height: 812 });
    // Below sm they stack, date first.
    await expect
      .poll(async () => {
        const a = await serviceDate.boundingBox();
        const b = await serviceTime.boundingBox();
        return a && b ? b.y - a.y : null;
      })
      .toBeGreaterThan(0);
    await openAllSections(page);
    const width = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(width).toBeLessThanOrEqual(375);
  });
});
