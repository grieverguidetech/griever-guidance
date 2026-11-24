import { describe, expect, it } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { v2 } from '@griever/tokens';

// #1073: the iOS root view is white unless the app sets it. Any moment with nothing drawn must show the page colour.
const appDir = join(__dirname, '../..');
const config = JSON.parse(readFileSync(join(appDir, 'app.json'), 'utf8')).expo;

describe('root background', () => {
  it('app.json sets the root background to the page colour token', () => {
    expect(String(config.backgroundColor).toLowerCase()).toBe(v2.roles.page.color.toLowerCase());
  });

  it('startup sets the root view to the page colour', () => {
    const entry = readFileSync(join(appDir, 'index.js'), 'utf8');
    expect(entry).toContain("from 'expo-system-ui'");
    expect(entry).toContain('SystemUI.setBackgroundColorAsync(v2.roles.page.color)');
  });
});
