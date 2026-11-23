import { primitives, type Primitives } from './primitives.js';
import { buildRoles } from './roles.js';

type Roles = ReturnType<typeof buildRoles>;

/** Layer 3: the finished looks. Each app draws them with its own components. */
export function buildRecipes(r: Roles, p: Primitives) {
  return {
    card: {
      fill: p.colors.glassFill,
      border: { width: p.border.thin, color: p.colors.glassBorder },
      shadow: [p.shadows.glass],
      radius: p.radius,
    },
    button: {
      primary: {
        swirl: r.loud,
        driftMs: p.motion.driftMs,
        /** One eased pass, then rest. At most 5 s (WCAG 2.2.2). */
        settleMs: p.motion.settleMs,
        text: { color: p.colors.primaryText, weight: p.font.weights.medium, family: p.font.bodyFamily },
        border: { width: p.border.thin, color: p.colors.primaryBorder },
        shadow: [p.shadows.sunset],
        radius: p.radius,
      },
      secondary: {
        swirl: r.soft,
        driftMs: p.motion.driftMs,
        text: { color: p.colors.secondaryText, weight: p.font.weights.regular, family: p.font.bodyFamily },
        border: { width: p.border.medium, color: p.colors.secondaryBorder },
        shadow: [p.shadows.glass],
        radius: p.radius,
      },
      /** The secondary tier (navigation): transparent, a thin link-colour edge, link-colour text. No swirl, shadow or drift. */
      outline: {
        text: { color: r.link, weight: p.font.weights.medium, family: p.font.bodyFamily },
        border: { width: p.border.thin, color: r.link },
        radius: p.radius,
      },
      /** The tertiary tier (suggestion): link-colour text with an underline, no fill or edge. */
      tertiary: {
        text: { color: r.link, weight: p.font.weights.medium, family: p.font.bodyFamily },
        underline: true,
      },
    },
    nudge: {
      swirl: r.nudge,
      driftMs: p.motion.driftMs,
      speckles: {
        colors: [p.colors.lavender, p.colors.sunGold, p.colors.sea, p.colors.ocean],
        alpha: p.speckleAlpha,
      },
      text: { color: p.colors.nudgeText, size: r.body.size, family: p.font.bodyFamily },
      border: { width: p.border.thin, color: p.colors.nudgeBorder },
      shadow: [p.shadows.nudgeNear, p.shadows.nudgeFar],
      orb: { size: p.size.orb, conic: [p.colors.ocean, p.colors.sea, p.colors.lavender, p.colors.sunGold] },
      radius: p.radius,
    },
    /** Text fields. The edge is a control edge, so it holds 3:1 (v2.spec). */
    field: {
      fill: p.colors.fieldFill,
      family: p.font.bodyFamily,
      edge: p.colors.fieldEdge,
      focusRing: p.colors.fieldFocus,
      radius: p.radius,
    },
    doneMark: r.doneMark,
  } as const;
}

export const recipes = buildRecipes(buildRoles(primitives), primitives);
