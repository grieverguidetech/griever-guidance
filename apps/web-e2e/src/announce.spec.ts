import { expect, test, type Page } from '@playwright/test';
import { copiedTexts, onboard, stubClipboard } from './support';

const EXPECTED =
  "With much love, we're letting you know that Margaret Hayes passed away on May 29, 2026. " +
  'Details of the service will follow once we have them. — Peter';

test.beforeEach(async ({ page }) => {
  await stubClipboard(page);
  await onboard(page);
  await page.getByRole('button', { name: 'Start' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Announce the passing' })).toBeVisible();
});

async function toReview(page: Page) {
  // No service question (#176): Continue goes straight to the people.
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByRole('heading', { name: 'Do you know the service details?' })).toHaveCount(0);

  await expect(page.getByRole('heading', { name: 'Who should know?' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Continue' })).toBeDisabled();
  await page.getByRole('checkbox', { name: /Aunt Carol/ }).click();
  await page.getByRole('checkbox', { name: /Bob Smith/ }).click();
  await expect(page.getByText('2 selected')).toBeVisible();
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByRole('heading', { name: 'Read it once before it goes' })).toBeVisible();
}

test('composes the announcement from the session details', async ({ page }) => {
  await expect(page.getByText('Margaret Hayes · passed May 29, 2026 · from Peter')).toBeVisible();
  await toReview(page);
  await expect(page.getByText(EXPECTED)).toBeVisible();
  await expect(page.getByText('This will go to 2 people as a text message.')).toBeVisible();
});

test('the softer tone changes the words, not the facts', async ({ page }) => {
  await toReview(page);
  await page.getByRole('button', { name: 'Softer tone' }).click();
  const message = page.getByText(/^It is with love and a heavy heart/);
  await expect(message).toContainText('Margaret Hayes passed away on May 29, 2026');
});

test('Back on the first form returns to the path, with no picker (#176)', async ({ page }) => {
  await page.getByRole('button', { name: 'Back' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'One thing at a time.' })).toBeVisible();
  await expect(page.getByText('What would you like to send?')).toHaveCount(0);
});

test('sends one person at a time, then opens the path with a quiet note (C1)', async ({ page }) => {
  await toReview(page);
  await page.getByRole('button', { name: 'Text 2 people' }).click();

  await expect(page.getByRole('heading', { name: 'Reaching people, one at a time' })).toBeVisible();
  await expect(page.getByText('1 of 2')).toBeVisible();
  await expect(page.getByText('Waiting')).toBeVisible(); // Bob is queued, not sent

  // Hand off by copying, then move on with one tap — no "did that send?" question.
  await page.getByRole('button', { name: 'Copy message' }).click();
  await expect(page.getByText('Copied. Paste it wherever you reach them.')).toBeVisible();
  expect(await copiedTexts(page)).toEqual([EXPECTED]);
  await page.getByRole('button', { name: 'Next' }).click();

  await expect(page.getByText('2 of 2')).toBeVisible();
  await page.getByRole('button', { name: 'Skip' }).click();

  // Done on the last person opens the path at once; nothing times out (#176).
  await expect(page.getByRole('heading', { level: 1, name: 'One thing at a time.' })).toBeVisible();
  await expect(
    page.getByText('You told 1 of 2. You can text the others from your own Messages app any time.'),
  ).toBeVisible();
  await expect(page.getByText(/We don't keep a copy of what was sent/)).toBeVisible();
  await page.getByRole('button', { name: 'Close note' }).click();
  await expect(page.getByText(/You told 1 of 2/)).toHaveCount(0);
});

test('"Open Messages" hands off to the phone and waits for the user', async ({ page }) => {
  await toReview(page);
  await page.getByRole('button', { name: 'Text 2 people' }).click();
  await page.getByRole('button', { name: 'Open Messages' }).click();
  await expect(page.getByText('Send it in Messages, then come back and tap Next.')).toBeVisible();
  await expect(page.getByText('1 of 2')).toBeVisible();
});
