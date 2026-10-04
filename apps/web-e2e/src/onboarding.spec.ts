import { expect, test } from '@playwright/test';
import { addContacts, BOB, CAROL, onboard } from './support';

test.describe('first visit', () => {
  test('starts at adding contacts, with no sign-up wall', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1, name: 'Who should we be able to reach?' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Back' })).toHaveCount(0);
  });

  test('explains a number that does not look right', async ({ page }) => {
    await page.goto('/');
    await page.getByLabel('Name').fill('Aunt Carol');
    await page.getByLabel('Mobile number').fill('123');
    await page.getByRole('button', { name: 'Add and start another' }).click();
    await expect(page.getByText("That number doesn't look right — check the area code and digits.")).toBeVisible();
    await expect(page.getByLabel('Name')).toHaveValue('Aunt Carol');
  });

  test('marks who hears first and files everyone else as friends & family', async ({ page }) => {
    await page.goto('/');
    await addContacts(page, [CAROL, BOB]);
    await expect(page.getByText('Hears first')).toHaveCount(1);
    await expect(page.getByText('Friends & family')).toHaveCount(1);
    await page.getByRole('button', { name: 'Done for now' }).click();
    await expect(page.getByRole('checkbox', { name: 'Aunt Carol' })).toBeChecked();
    await expect(page.getByRole('checkbox', { name: 'Bob Smith' })).not.toBeChecked();
  });

  test('reaches one next thing: announcing the passing', async ({ page }) => {
    await onboard(page);
    await expect(page.getByText('For Margaret Hayes')).toBeVisible();
    await expect(page.getByText('Announce the passing')).toBeVisible();
    // C10: the service and obituary come later in the real order, never first.
    await expect(page.getByRole('button', { name: /Share the service/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /Share the obituary/ })).toBeVisible();
  });
});

test.describe('coming back', () => {
  test('a reload lands back on the session with nothing lost', async ({ page }) => {
    await onboard(page);
    await page.reload();
    await expect(page.getByRole('heading', { level: 1, name: 'One thing at a time.' })).toBeVisible();
    await expect(page.getByText('For Margaret Hayes')).toBeVisible();
  });

  test('keeps working with the network cut off after load (C5)', async ({ page, context }) => {
    await page.goto('/');
    await context.setOffline(true);
    await addContacts(page, [CAROL]);
    await page.getByRole('button', { name: 'Done for now' }).click();
    await expect(page.getByRole('heading', { name: 'Who should hear first?' })).toBeVisible();
    await context.setOffline(false);
  });
});
