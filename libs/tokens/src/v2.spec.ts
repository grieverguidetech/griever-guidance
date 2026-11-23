import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { v2 } from './index.js';
import { buildRecipes } from './v2/recipes.js';
import { buildRoles } from './v2/roles.js';
import { primitives } from './v2/primitives.js';

type Rgb = [number, number, number];

function parse(color: string): { rgb: Rgb; alpha: number } {
  if (color.startsWith('#')) {
    const rgb = [1, 3, 5].map((i) => Number.parseInt(color.slice(i, i + 2), 16)) as Rgb;
    return { rgb, alpha: 1 };
  }
  const [r, g, b, a] = (/rgba\(([^)]+)\)/.exec(color)?.[1] ?? '').split(',').map(Number);
  return { rgb: [r, g, b], alpha: a };
}

/** Paints a colour over an opaque background and returns the opaque result. */
function over(color: string, background: string): string {
  const top = parse(color);
  const bottom = parse(background).rgb;
  const mixed = top.rgb.map((v, i) => v * top.alpha + bottom[i] * (1 - top.alpha));
  return `#${mixed.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`;
}

function luminance(hex: string): number {
  const channels = parse(hex).rgb.map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function contrast(a: string, b: string): number {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (light + 0.05) / (dark + 0.05);
}

const { colors: c, gradients: g } = primitives;
const grounds = {
  page: c.page,
  sunGlow: c.glowSun,
  skyGlow: c.glowSky,
  glassOverPage: over(c.glassFill, c.page),
  glassOverSun: over(c.glassFill, c.glowSun),
  glassOverSky: over(c.glassFill, c.glowSky),
};

/** Every string leaf in a value, so we can check where each colour comes from. */
function leaves(value: unknown): string[] {
  if (typeof value === 'string') {
    return [value];
  }
  if (value && typeof value === 'object') {
    return Object.values(value).flatMap(leaves);
  }
  return [];
}

describe('v2 tokens: layers', () => {
  it('lets every string in the roles and recipes be a value from the primitives', () => {
    const known = new Set(leaves(primitives));
    for (const layer of [v2.roles, v2.recipes]) {
      for (const value of leaves(layer)) {
        expect(known.has(value), value).toBe(true);
      }
    }
  });

  it('keeps hex and rgba literals out of the roles and recipes source', () => {
    for (const file of ['v2/roles.ts', 'v2/recipes.ts']) {
      const source = readFileSync(fileURLToPath(new URL(file, import.meta.url)), 'utf8');
      expect(source, file).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
      expect(source, file).not.toMatch(/rgba?\(/);
    }
  });

  it('cascades a primitive change to the role and recipe that use it', () => {
    const changed = {
      ...primitives,
      colors: { ...primitives.colors, heading: '#000000', primaryBorder: '#111111' },
    };
    const roles = buildRoles(changed);
    expect(roles.heading.color).toBe('#000000');
    expect(buildRecipes(roles, changed).button.primary.border.color).toBe('#111111');
  });

  it('has the roles and recipes the ticket names', () => {
    expect(Object.keys(v2.roles).sort()).toEqual(
      [
        'body', 'divider', 'doneMark', 'error', 'eyebrow', 'focus', 'heading', 'ink', 'link', 'loud',
        'muted', 'mutedStrong', 'nudge', 'page', 'success', 'wash',
      ],
    );
    expect(Object.keys(v2.recipes).sort()).toEqual(['button', 'card', 'doneMark', 'field', 'nudge']);
    expect(Object.keys(v2.recipes.button).sort()).toEqual(['outline', 'primary', 'tertiary']);
    // The blue soft-ocean swirl is gone from every layer.
    expect('softOcean' in v2.primitives.gradients).toBe(false);
    expect('soft' in v2.roles).toBe(false);
    // The secondary tier (navigation) is a transparent outline in the link colour; the tertiary (suggestion) is underlined link text.
    const { outline, tertiary } = v2.recipes.button;
    expect(outline.text.color).toBe(v2.roles.link);
    expect(outline.border).toEqual({ width: v2.primitives.border.thin, color: v2.roles.link });
    expect(tertiary.text.color).toBe(v2.roles.link);
    expect(tertiary.underline).toBe(true);
  });

});

describe('v2 tokens: web values', () => {
  it('uses the web error and success values (D2), not the mobile ones', () => {
    expect(v2.roles.error).toBe('#b3261e');
    expect(v2.roles.success).toBe('#2a7048');
  });

  it('keeps the web divider and the field radius', () => {
    expect(v2.roles.divider).toBe('rgba(32,30,29,0.16)');
    expect(v2.recipes.field.radius).toBe(8);
  });
});

describe('v2 tokens: contrast', () => {
  it('gives ink, heading and eyebrow at least 4.5:1 on every ground', () => {
    for (const [name, ground] of Object.entries(grounds)) {
      for (const text of [c.ink, c.heading, c.eyebrow]) {
        expect(contrast(text, ground), `${text} on ${name}`).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it('gives button text at least 4.5:1 on every fill stop', () => {
    for (const stop of g.sunset.stops) {
      expect(contrast(c.primaryText, stop), stop).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('gives nudge text at least 4.5:1 on every stop, with and without a speckle', () => {
    const speckles = [c.lavender, c.sunGold, c.sea, c.ocean];
    for (const stop of g.pastel.stops) {
      expect(contrast(c.nudgeText, stop), stop).toBeGreaterThanOrEqual(4.5);
      for (const speckle of speckles) {
        const blended = over(`rgba(${parse(speckle).rgb.join(',')},${primitives.speckleAlpha})`, stop);
        expect(contrast(c.nudgeText, blended), `${speckle} on ${stop}`).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  // The glass and nudge card borders are decorative edges, not controls, so they are not held to 3:1.
  it('gives control borders and the open ring at least 3:1 on every ground', () => {
    for (const [name, ground] of Object.entries(grounds)) {
      for (const border of [c.primaryBorder, v2.recipes.button.outline.border.color, c.openRing, v2.roles.focus]) {
        expect(contrast(border, ground), `${border} on ${name}`).toBeGreaterThanOrEqual(3);
      }
    }
  });

  it('gives every done-mark swirl colour at least 3:1 on every ground', () => {
    for (const [name, ground] of Object.entries(grounds)) {
      for (const stop of v2.roles.doneMark.swirl) {
        expect(contrast(stop, ground), `${stop} on ${name}`).toBeGreaterThanOrEqual(3);
      }
    }
  });

  it('gives link, muted, mutedStrong, error and success at least 4.5:1 on every ground', () => {
    const texts = {
      link: v2.roles.link,
      muted: v2.roles.muted,
      mutedStrong: v2.roles.mutedStrong,
      error: v2.roles.error,
      success: v2.roles.success,
    };
    for (const [ground, bg] of Object.entries(grounds)) {
      for (const [role, color] of Object.entries(texts)) {
        expect(contrast(color, bg), `${role} on ${ground}`).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it('gives the field edge and focus ring at least 3:1 on every ground', () => {
    for (const [ground, bg] of Object.entries(grounds)) {
      for (const color of [v2.recipes.field.edge, v2.recipes.field.focusRing]) {
        expect(contrast(color, bg), `${color} on ${ground}`).toBeGreaterThanOrEqual(3);
      }
    }
  });

  it('gives mutedStrong and link text at least 4.5:1 on the selected-row wash', () => {
    for (const color of [v2.roles.mutedStrong, v2.roles.link]) {
      expect(contrast(color, v2.roles.wash), color).toBeGreaterThanOrEqual(4.5);
    }
  });
});

describe('v2 tokens: contrast on the field fill', () => {
  const { fill, edge } = v2.recipes.field;

  it('gives the field edge at least 3:1 against the fill', () => {
    expect(contrast(edge, fill)).toBeGreaterThanOrEqual(3);
  });

  it('gives muted, link, error and success text at least 4.5:1 on the fill', () => {
    const roles = { muted: v2.roles.muted, link: v2.roles.link, error: v2.roles.error, success: v2.roles.success };
    for (const [role, color] of Object.entries(roles)) {
      expect(contrast(color, fill), `${role} on fill`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('gives error and success at least 4.5:1 on the page colour', () => {
    for (const [role, color] of Object.entries({ error: v2.roles.error, success: v2.roles.success })) {
      expect(contrast(color, v2.roles.page.color), `${role} on page`).toBeGreaterThanOrEqual(4.5);
    }
  });
});
