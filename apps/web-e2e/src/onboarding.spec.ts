import { expect, test } from '@playwright/test';
import { addContacts, BOB, CAROL, HOME_HEADING, onboard, startFirstPerson } from './support';

test.describe('first visit', () => {
  test('starts at Home, with no sign-up wall and nobody listed', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1, name: HOME_HEADING })).toBeVisible();
    await expect(page.getByRole('button', { name: "Start with someone I've lost" })).toBeVisible();
    await expect(page.getByRole('button', { name: "What you'll need" })).toBeVisible();
    await expect(page.getByRole('list')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Back' })).toHaveCount(0);
  });

  test('explains a number that does not look right', async ({ page }) => {
    await startFirstPerson(page);
    await page.getByLabel('Name').fill('Aunt Carol');
    await page.getByLabel('Mobile number').fill('123');
    await page.getByRole('button', { name: 'Add and start another' }).click();
    await expect(page.getByText("That number doesn't look right — check the area code and digits.")).toBeVisible();
    await expect(page.getByLabel('Name')).toHaveValue('Aunt Carol');
  });

  test('marks who hears first and files everyone else as friends & family', async ({ page }) => {
    await startFirstPerson(page);
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

test.describe('What you will need', () => {
  test('starts unticked, and ticks stay after a reload (#176)', async ({ page }) => {
    await onboard(page);
    await page.getByRole('button', { name: "What you'll need" }).first().click();
    const row = page.getByRole('button', { name: /Life insurance policies/ });
    await expect(page.getByRole('button', { pressed: true })).toHaveCount(0);
    await row.click();
    await expect(row).toHaveAttribute('aria-pressed', 'true');
    // The tick shows at once; the save to IndexedDB finishes a moment later. Reload only once it
    // is confirmed in the store, so the test does not cut the write short.
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            new Promise<string[]>((resolve, reject) => {
              const open = indexedDB.open('gg');
              open.onerror = () => reject(open.error);
              open.onsuccess = () => {
                const get = open.result.transaction('account').objectStore('account').get('checklistTicks');
                get.onerror = () => reject(get.error);
                get.onsuccess = () => {
                  open.result.close();
                  resolve((get.result?.value as string[] | undefined) ?? []);
                };
              };
            }),
        ),
      )
      .toContain('life-insurance');
    await page.reload();
    await page.getByRole('button', { name: "What you'll need" }).first().click();
    await expect(page.getByRole('button', { name: /Life insurance policies/ })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByRole('button', { name: /Military discharge papers/ })).toHaveAttribute('aria-pressed', 'false');
  });
});

test.describe('coming back', () => {
  test('a reload lands on Home listing the person, and opening her shows her path', async ({ page }) => {
    await onboard(page);
    await page.reload();
    await expect(page.getByRole('heading', { level: 1, name: "The people you're writing about" })).toBeVisible();
    await page.getByRole('button', { name: /Margaret Hayes/ }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'One thing at a time.' })).toBeVisible();
    await expect(page.getByText('For Margaret Hayes')).toBeVisible();
    await page.getByRole('button', { name: 'Back' }).click();
    await expect(page.getByRole('heading', { level: 1, name: "The people you're writing about" })).toBeFocused();
  });

  test('a half-written message shows Started on the path, and one tap resumes it (#176)', async ({ page }) => {
    await onboard(page);
    await page.getByRole('button', { name: 'Start' }).click();
    await page.getByLabel(/Anything you'd like to add/).fill('She was peaceful.');
    await page.reload();
    await page.getByRole('button', { name: /Margaret Hayes/ }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'One thing at a time.' })).toBeVisible();
    await expect(page.getByText('Started')).toBeVisible();
    await page.getByRole('button', { name: 'Continue' }).click();
    await expect(page.getByLabel(/Anything you'd like to add/)).toHaveValue('She was peaceful.');
  });

  test('keeps working with the network cut off after load (C5)', async ({ page, context }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1, name: HOME_HEADING })).toBeVisible();
    await context.setOffline(true);
    await page.getByRole('button', { name: "Start with someone I've lost" }).click();
    await page.getByLabel('Their name').fill('Margaret Hayes');
    await page.getByRole('button', { name: 'Continue' }).click();
    await addContacts(page, [CAROL]);
    await page.getByRole('button', { name: 'Done for now' }).click();
    await expect(page.getByRole('heading', { name: 'Who should hear first?' })).toBeVisible();
    await page.getByRole('button', { name: 'Save and continue' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'One thing at a time.' })).toBeVisible();
    await context.setOffline(false);
  });
});
