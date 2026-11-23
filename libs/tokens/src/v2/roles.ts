import { primitives, type Primitives } from './primitives.js';

/** Layer 2: what each primitive is for. Built from a primitives argument so a change cascades. */
export function buildRoles(p: Primitives) {
  return {
    ink: p.colors.ink,
    heading: { color: p.colors.heading, weight: p.font.weights.light, family: p.font.family },
    eyebrow: {
      color: p.colors.eyebrow,
      size: p.size.eyebrow,
      tracking: p.size.eyebrowTracking,
      uppercase: true,
    },
    body: { size: p.size.body, weight: p.font.weights.regular, family: p.font.family },
    page: { color: p.colors.page, glows: [p.colors.glowSun, p.colors.glowSky] },
    /** The strong swirl: the primary action. */
    loud: p.gradients.sunset,
    /** The quiet swirl: secondary actions. */
    soft: p.gradients.softOcean,
    nudge: p.gradients.pastel,
    doneMark: {
      swirl: [p.colors.ocean, p.colors.sea, p.colors.lavender],
      size: p.size.mark,
      spinMs: p.motion.spinMs,
      openRing: p.colors.openRing,
      openWidth: p.border.medium,
    },
  } as const;
}

export const roles = buildRoles(primitives);
