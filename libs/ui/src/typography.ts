import { v2 } from '@griever/tokens';

/** The web body family: Nunito Sans, from the generated --font-v2-body var (apps/web/src/theme.generated.css). */
export const webFontFamily = 'var(--font-v2-body)';

/** The web heading family: Fraunces, from the generated --font-v2-heading var. */
export const webHeadingFontFamily = 'var(--font-v2-heading)';

/**
 * `heading` is the h1 weight (v2.roles.heading) and `headingRegular` the lower heading levels; both use the
 * heading family. `regular` and `semibold` use the body family (`semibold` is the emphasis weight, 600).
 */
export type SerifWeight = 'heading' | 'headingRegular' | 'regular' | 'semibold';

/** The family for a step: the heading var for heading steps, the body var for the rest. The weight is set through `fontWeight`. */
export function serifFamily(weight?: SerifWeight): string {
  return weight === 'heading' || weight === 'headingRegular' ? webHeadingFontFamily : webFontFamily;
}

/** The `fontWeight` for a step, from the v2 token weights. */
export function serifWeight(weight: SerifWeight): '300' | '400' | '600' {
  const weights = v2.primitives.font.weights;
  if (weight === 'heading') {
    return String(v2.roles.heading.weight) as '300';
  }
  return String(weight === 'semibold' ? weights.medium : weights.regular) as '400' | '600';
}

/**
 * `fontFamily` and `fontWeight` for a step. The SOFT axis of the heading family is set in CSS on the h1 to h6
 * elements (apps/web/src/styles.css), which is where react-native-web draws a Heading.
 */
export function useSerifStyle(weight: SerifWeight): { fontFamily: string; fontWeight: '300' | '400' | '600' } {
  return { fontFamily: serifFamily(weight), fontWeight: serifWeight(weight) };
}
