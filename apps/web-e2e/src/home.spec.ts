import { expect, test } from '@playwright/test';
import { addContacts, CAROL, HOME_HEADING, startFirstPerson } from './support';

const home = (page: import('@playwright/test').Page) =>
  page.getByRole('heading', { level: 1, name: HOME_HEADING });

test.describe('Home and creating a person', () => {
  test('first visit: Home, setup, contacts, who hears first, the path, then back to Home', async ({ page }) => {
    await page.goto('/');
    await expect(home(page)).toBeVisible();
    await expect(page.getByRole('list')).toHaveCount(0);

    await page.getByRole('button', { name: "Start with someone I've lost" }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Who are we writing about?' })).toBeVisible();
    // C10: no obituary link is asked for here.
    await expect(page.getByLabel(/obituary/i)).toHaveCount(0);
    await page.getByLabel('Their name').fill('Margaret Hayes');
    await page.getByRole('button', { name: 'Continue' }).click();

    await expect(page.getByRole('heading', { level: 1, name: 'Who should we be able to reach?' })).toBeVisible();
    await addContacts(page, [CAROL]);
    await page.getByRole('button', { name: 'Done for now' }).click();

    await expect(page.getByRole('heading', { level: 1, name: 'Who should hear first?' })).toBeVisible();
    await page.getByRole('button', { name: 'Save and continue' }).click();

    await expect(page.getByRole('heading', { level: 1, name: 'One thing at a time.' })).toBeVisible();
    await expect(page.getByText('For Margaret Hayes')).toBeVisible();

    await page.getByRole('button', { name: 'Home', exact: true }).click();
    await expect(home(page)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Margaret Hayes' })).toBeVisible();
  });

  test('a second person skips adding contacts: setup, who hears first, the path', async ({ page }) => {
    await startFirstPerson(page);
    await addContacts(page, [CAROL]);
    await page.getByRole('button', { name: 'Done for now' }).click();
    await page.getByRole('button', { name: 'Save and continue' }).click();
    await page.getByRole('button', { name: 'Home', exact: true }).click();

    await page.getByRole('button', { name: "Someone else I've lost" }).click();
    await page.getByLabel('Their name').fill('Harold Price');
    await page.getByRole('button', { name: 'Continue' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Who should hear first?' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Who should we be able to reach?' })).toHaveCount(0);
    await page.getByRole('button', { name: 'Save and continue' }).click();
    await expect(page.getByText('For Harold Price')).toBeVisible();
  });

  test('Back from an untouched setup returns to Home with nobody listed', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: "Start with someone I've lost" }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Who are we writing about?' })).toBeVisible();
    await page.getByRole('button', { name: 'Back' }).click();
    await expect(home(page)).toBeFocused();
    await expect(page.getByRole('list')).toHaveCount(0);
  });

  test('Back goes from who hears first to contacts to setup to Home', async ({ page }) => {
    await startFirstPerson(page);
    await addContacts(page, [CAROL]);
    await page.getByRole('button', { name: 'Done for now' }).click();
    await page.getByRole('button', { name: 'Back' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Who should we be able to reach?' })).toBeVisible();
    await page.getByRole('button', { name: 'Back' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Who are we writing about?' })).toBeVisible();
    await page.getByRole('button', { name: 'Back' }).click();
    await expect(home(page)).toBeVisible();
  });
});
