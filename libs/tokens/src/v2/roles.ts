import { primitives, type Primitives } from './primitives.js';

/** Layer 2: what each primitive is for. Built from a primitives argument so a change cascades. */
export function buildRoles(p: Primitives) {
  return {
    ink: p.colors.ink,
    heading: {
      color: p.colors.heading,
      weight: p.font.weights.light,
      family: p.font.headingFamily,
      soft: p.font.headingSoft,
    },
    eyebrow: {
      family: p.font.headingFamily,
      color: p.colors.eyebrow,
      size: p.size.eyebrow,
      tracking: p.size.eyebrowTracking,
      uppercase: true,
    },
    body: { size: p.size.body, weight: p.font.weights.regular, family: p.font.bodyFamily },
    page: { color: p.colors.page, glows: { topRight: p.colors.glowSun, bottomLeft: p.colors.glowSky } },
    /** The focus ring on controls that are not buttons, like hub cards. At least 3:1 on every ground (v2.spec). */
    focus: p.colors.link,
    link: p.colors.link,
    /** Tint behind a selected row. */
    wash: p.colors.wash,
    /** Plain muted is not used on the wash; use mutedStrong there. */
    muted: p.colors.muted,
    /** Secondary text that can sit on the wash. */
    mutedStrong: p.colors.mutedStrong,
    divider: p.colors.divider,
    error: p.colors.error,
    success: p.colors.success,
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
