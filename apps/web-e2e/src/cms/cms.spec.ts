import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

/**
 * The web editor, flag on (#396). Runs only through playwright.cms.config.ts, against a build made
 * with VITE_FEATURE_CMS=true. Desktop Chrome only (#431).
 */
const WCAG = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

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

function nav(page: Page) {
  return page.getByRole('navigation');
}

async function openSection(page: Page, name: string, heading: string) {
  await nav(page).getByRole('button', { name: new RegExp(`^${name}`) }).click();
  await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible();
}

/** With the editor on and nobody saved, loading the app opens The person directly (#448; auth is off in this build). */
async function startPerson(page: Page) {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1, name: 'The person' })).toBeVisible();
}

const screens: Record<string, (page: Page) => Promise<void>> = {
  Overview: async (page) => {
    await startPerson(page);
    await page.getByLabel('Their name').fill('Margaret Hayes');
    await openSection(page, 'Overview', 'Overview');
  },
  Service: async (page) => {
    await startPerson(page);
    await openSection(page, 'Service', 'Service');
  },
  'Service, all groups open': async (page) => {
    await startPerson(page);
    await openSection(page, 'Service', 'Service');
    for (const add of ['Add visitation or calling hours', 'Add burial', 'Add reception']) {
      await page.getByRole('button', { name: add }).click();
    }
  },
  'Service, changing the words': async (page) => {
    await startPerson(page);
    await openSection(page, 'Service', 'Service');
    await page.getByRole('button', { name: 'Change the words', exact: true }).click();
    await expect(page.getByRole('textbox', { name: 'Message', exact: true })).toBeFocused();
  },
  Announcement: async (page) => {
    await startPerson(page);
    await page.getByLabel('Their name').fill('Margaret Hayes');
    await openSection(page, 'Announcement', 'Announcement');
  },
  Obituary: async (page) => {
    await startPerson(page);
    await page.getByLabel('Their name').fill('Margaret Hayes');
    await openSection(page, 'Obituary', 'Obituary');
  },
  'Thank-yous': async (page) => {
    await startPerson(page);
    await page.getByLabel('Their name').fill('Margaret Hayes');
    await openSection(page, 'Thank-yous', 'Thank-yous');
  },
  'The person': async (page) => {
    await startPerson(page);
  },
  // Auth is off in this build, so this is the settings body; the profile body is covered by the app specs.
  'Your account': async (page) => {
    await startPerson(page);
    await page.getByLabel('Their name').fill('Margaret Hayes');
    await openSection(page, 'Your account', 'Your account');
    await expect(page.getByRole('button', { name: 'Remove everything from this device' })).toBeVisible();
  },
  'Your people': async (page) => {
    await startPerson(page);
    await page.getByLabel('Their name').fill('Margaret Hayes');
    await page.getByRole('button', { name: /^Change who/ }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Your people' })).toBeVisible();
    await expect(page.getByRole('heading', { name: "Who you're writing about" })).toHaveCount(0);
  },
};

for (const [name, open] of Object.entries(screens)) {
  test(`${name}: no WCAG A/AA violations (contrast checked separately)`, async ({ page }) => {
    await open(page);
    expect(await violations(page)).toEqual([]);
  });

  test(`${name}: text meets AA contrast`, async ({ page }) => {
    await open(page);
    expect(await violations(page, { contrastOnly: true })).toEqual([]);
  });
}

test('the editor is on: no path or send flow', async ({ page }) => {
  await startPerson(page);
  await expect(page.getByRole('heading', { name: 'One thing at a time.' })).toHaveCount(0);
  await expect(page.locator('a[href^="sms:"]')).toHaveCount(0);
});

test('a typed name reaches the Overview, and "Private burial" keeps the Burial group', async ({ page }) => {
  await startPerson(page);

  await page.getByLabel('Their name').fill('Margaret Hayes');
  await openSection(page, 'Overview', 'Overview');
  // The name sits in a paragraph above the nav landmark, not inside it.
  await expect(page.getByText('Margaret Hayes', { exact: true }).first()).toBeVisible();

  await openSection(page, 'The person', 'The person');
  await expect(page.getByLabel('Their name')).toHaveValue('Margaret Hayes');

  await openSection(page, 'Service', 'Service');
  await page.getByRole('button', { name: 'Add burial' }).click();
  const burial = page.getByRole('group', { name: 'Burial', exact: true });
  const privateBurial = burial.getByRole('checkbox', { name: 'Private burial, family only' });
  await expect(burial.getByLabel(/Cemetery/)).toBeVisible();

  await privateBurial.check();
  await expect(privateBurial).toBeChecked();
  // The group and its checkbox stay; only the date, time and place fields go.
  await expect(burial).toBeVisible();
  await expect(burial.getByLabel(/Cemetery/)).toHaveCount(0);

  // The choice is saved as you go.
  await page.reload();
  // A saved person: loading opens their Overview.
  await expect(page.getByRole('heading', { level: 1, name: 'Overview' })).toBeVisible();
  await expect(page.getByText('Margaret Hayes', { exact: true }).first()).toBeVisible();
  await openSection(page, 'Service', 'Service');
  await expect(
    page.getByRole('group', { name: 'Burial', exact: true }).getByRole('checkbox', { name: 'Private burial, family only' }),
  ).toBeChecked();
});

test('Ready leads on: The person ready, Next opens Announcement with its h1; no axe violations after Ready', async ({ page }) => {
  await startPerson(page);
  await page.getByLabel('Their name').fill('Margaret Hayes');
  await page.getByRole('button', { name: 'Mark as ready' }).click();
  const next = page.getByRole('button', { name: 'Next: Announcement' });
  await expect(next).toBeVisible();
  expect(await violations(page)).toEqual([]);
  await next.click();
  const heading = page.getByRole('heading', { level: 1, name: 'Announcement' });
  await expect(heading).toBeVisible();
  await expect(heading).toBeFocused();
});

test.describe('no sync while signed out (#520)', () => {
  test('the editor flow makes no /flows request (auth is off in this build)', async ({ page }) => {
    const flowRequests: string[] = [];
    page.on('request', (request) => {
      if (new URL(request.url()).pathname.startsWith('/flows')) {
        flowRequests.push(request.url());
      }
    });
    await startPerson(page);
    await page.getByLabel('Their name').fill('Margaret Hayes');
    await openSection(page, 'Overview', 'Overview');
    // Past the sync edit debounce (1 s), so a stray send would have shown up.
    await page.waitForTimeout(1500);
    expect(flowRequests).toEqual([]);
  });
});
