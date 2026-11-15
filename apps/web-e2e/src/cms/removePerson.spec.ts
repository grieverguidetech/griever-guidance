import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

/**
 * Remove a person on Account (#222). Runs only through playwright.cms.config.ts (editor build).
 * Accounts are off in this build, so the person is removed on this device and no request is sent.
 */
const WCAG = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

test('an owner removes a person from Account, and Your people no longer lists them', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1, name: 'Overview' })).toBeVisible();
  await page.getByRole('button', { name: "Start with someone I've lost" }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'The person' })).toBeVisible();
  await page.getByLabel('Their name').fill('Margaret Hayes');

  const nav = page.getByRole('navigation').first();
  await nav.getByRole('button', { name: /^Your account/ }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Account' })).toBeVisible();

  await page.getByRole('button', { name: 'Remove Margaret Hayes' }).click();
  await expect(page.getByRole('heading', { name: 'Remove Margaret Hayes?' })).toBeVisible();

  const { violations } = await new AxeBuilder({ page }).withTags(WCAG).disableRules(['color-contrast']).analyze();
  expect(violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);

  await page.getByRole('button', { name: 'Yes, remove Margaret Hayes' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Margaret Hayes has been removed.' })).toBeVisible();

  await nav.getByRole('button', { name: /^Your people/ }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Your people' })).toBeVisible();
  await expect(page.getByText('Margaret Hayes')).toHaveCount(0);
});
