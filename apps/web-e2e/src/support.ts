import { expect, type Page } from '@playwright/test';

export interface TestContact {
  name: string;
  phone: string;
  hearsFirst?: boolean;
}

export const CAROL: TestContact = { name: 'Aunt Carol', phone: '(617) 555-0148', hearsFirst: true };
export const BOB: TestContact = { name: 'Bob Smith', phone: '6175550199' };

/**
 * Makes "Copy message" deterministic across browsers: removes the Web Share
 * API (so the button is always "Copy message", never "Share") and records
 * what was copied on `window.__copied` instead of touching the real clipboard.
 */
export async function stubClipboard(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as { __copied?: string[] };
    delete (Navigator.prototype as { share?: unknown }).share;
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: async (text: string) => {
          w.__copied = [...(w.__copied ?? []), text];
        },
      },
    });
  });
}

export async function copiedTexts(page: Page): Promise<string[]> {
  return page.evaluate(() => (window as unknown as { __copied?: string[] }).__copied ?? []);
}

export async function addContacts(page: Page, contacts: TestContact[]) {
  for (const c of contacts) {
    await page.getByLabel('Name').fill(c.name);
    await page.getByLabel('Mobile number').fill(c.phone);
    if (c.hearsFirst) await page.getByText('One of the people who should hear first').click();
    await page.getByRole('button', { name: 'Add and start another' }).click();
  }
  await expect(page.getByText(`Added so far — ${contacts.length}`)).toBeVisible();
}

/** First visit through to the path landing, via the UI only. */
export async function onboard(
  page: Page,
  { contacts = [CAROL, BOB], personName = 'Margaret Hayes', senderName = 'Peter' } = {},
) {
  await page.goto('/');
  await addContacts(page, contacts);
  await page.getByRole('button', { name: 'Done for now' }).click();
  await page.getByRole('button', { name: 'Save and continue' }).click();
  await page.getByLabel('Their name').fill(personName);
  await page.getByLabel('Date they passed').fill('May 29, 2026');
  if (senderName) await page.getByLabel('Your name (optional)').fill(senderName);
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'One thing at a time.' })).toBeVisible();
}
