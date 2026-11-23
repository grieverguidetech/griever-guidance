import { v2 } from '@griever/tokens';

/** The web family: Sora, from the generated --font-v2 var (apps/web/src/theme.generated.css). */
export const webFontFamily = 'var(--font-v2)';

/** `heading` is the h1 weight (v2.roles.heading). `semibold` is the medium step on web. */
export type SerifWeight = 'heading' | 'regular' | 'semibold';

/** The family for every weight: the CSS var. The weight is set through `fontWeight`. */
export function serifFamily(): string {
  return webFontFamily;
}

/** The `fontWeight` for a step, from the v2 token weights. */
export function serifWeight(weight: SerifWeight): '300' | '400' | '500' {
  const weights = v2.primitives.font.weights;
  if (weight === 'heading') {
    return String(v2.roles.heading.weight) as '300';
  }
  return String(weight === 'semibold' ? weights.medium : weights.regular) as '400';
}

/** `fontFamily` and `fontWeight` for a step. */
export function useSerifStyle(weight: SerifWeight): { fontFamily: string; fontWeight: '300' | '400' | '500' } {
  return { fontFamily: serifFamily(), fontWeight: serifWeight(weight) };
}
