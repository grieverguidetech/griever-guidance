import { describe, expect, it } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const appDir = join(__dirname, '../..');
const config = JSON.parse(readFileSync(join(appDir, 'app.json'), 'utf8')).expo;

const PNG_SIGNATURE = '89504e470d0a1a0a';
/** PNG color types with no alpha channel: grayscale (0) and truecolor (2). */
const OPAQUE_COLOR_TYPES = [0, 2];

type PngHeader = { width: number; height: number; colorType: number };

/** Reads the PNG signature and the IHDR chunk, which always comes first. */
function readPngHeader(relativePath: string): PngHeader {
  const bytes = readFileSync(join(appDir, relativePath));
  expect(bytes.subarray(0, 8).toString('hex')).toBe(PNG_SIGNATURE);
  expect(bytes.subarray(12, 16).toString('ascii')).toBe('IHDR');
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20), colorType: bytes[25] };
}

function splashOptions(): { image: string; backgroundColor: string } {
  const splash = config.plugins.find((plugin: unknown) => {
    return Array.isArray(plugin) && plugin[0] === 'expo-splash-screen';
  });
  return splash[1];
}

describe('app icon and splash (#917)', () => {
  it('uses a 1024 x 1024 app icon with no alpha channel, which App Store Connect requires', () => {
    const icon = readPngHeader(config.icon);
    expect(icon.width).toBe(1024);
    expect(icon.height).toBe(1024);
    expect(OPAQUE_COLOR_TYPES).toContain(icon.colorType);
  });

  it('has a 1024 x 1024 splash image on a white background', () => {
    expect(splashOptions().backgroundColor).toBe('#ffffff');
    const splash = readPngHeader(splashOptions().image);
    expect(splash.width).toBe(1024);
    expect(splash.height).toBe(1024);
  });

  it('has a 1024 x 1024 Android adaptive icon foreground', () => {
    const adaptive = readPngHeader(config.android.adaptiveIcon.foregroundImage);
    expect(adaptive.width).toBe(1024);
    expect(adaptive.height).toBe(1024);
  });
});
