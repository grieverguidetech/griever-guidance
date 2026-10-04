import { expect, test } from '@playwright/test';
import { onboard } from './support';

test.beforeEach(async ({ page }) => {
  await onboard(page);
  await page.getByRole('button', { name: /Share the service/ }).click();
  await expect(page.getByRole('heading', { name: 'Have the arrangements been made?' })).toBeVisible();
});

test('"Not yet" goes back without pressure', async ({ page }) => {
  await expect(page.getByText("Most families take three or four days to get this far. You're not behind.")).toBeVisible();
  await page.getByRole('button', { name: /^Not yet/ }).click();
  await expect(page.getByRole('button', { name: /^Not yet/ })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'One thing at a time.' })).toBeVisible();
});

test('"Yes" moves on to the service details', async ({ page }) => {
  await page.getByRole('button', { name: /^Yes, we've set a date/ }).click();
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByRole('heading', { name: 'Have the arrangements been made?' })).toHaveCount(0);
  await expect(page.getByLabel(/Service date/)).toBeVisible();
});
