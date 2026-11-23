import { expect, test } from '@playwright/test';
import { onboard } from './support';

// The libs/ui Button reaches web only through data-gg-btn. This reads computed styles in a real browser,
// because jsdom cannot show whether the layered styles.css rules and react-native-web's unlayered resets agree.
test('the shared primary Button draws the swirl look: edge, radius, gradient, label colour and focus ring', async ({ page }) => {
  await onboard(page);
  const start = page.getByRole('button', { name: 'Start' }).first();
  await expect(start).toHaveAttribute('data-gg-btn', 'primary');

  const styles = await start.evaluate((node) => {
    const s = getComputedStyle(node);
    const label = getComputedStyle(node.querySelector('div, span') ?? node);
    return {
      borderStyle: s.borderTopStyle,
      borderWidth: s.borderTopWidth,
      radius: s.borderTopLeftRadius,
      image: s.backgroundImage,
      labelColor: label.color,
    };
  });
  expect(styles.borderStyle).toBe('solid');
  expect(styles.borderWidth).toBe('1px');
  expect(styles.radius).toBe('8px');
  expect(styles.image).toContain('linear-gradient');
  expect(styles.labelColor).toBe('rgb(42, 31, 18)');

  for (let i = 0; i < 40; i += 1) {
    await page.keyboard.press('Tab');
    if (await start.evaluate((node) => node === document.activeElement)) {
      break;
    }
  }
  await expect(start).toBeFocused();
  const outline = await start.evaluate((node) => getComputedStyle(node).outlineColor);
  expect(outline).toBe('rgb(0, 103, 134)');
});
