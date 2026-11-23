/**
 * Design tokens shared by web and mobile: layout spacing and v2. The web theme
 * apps/web/src/theme.generated.css is generated from them; apps/web/src/tokens.spec.ts fails when
 * the file is stale.
 */

/** Pixels. Keys match the `--space-*` custom properties. */
export const spacing = { 1: 5, 2: 10, 3: 15, 4: 20, 6: 30, 8: 40 } as const;

/** The smallest touch target, in pixels (REQUIREMENTS.md accessibility rules). */
export const minTouchTarget = 44;

export {
  block,
  generatedHeader,
  rootLines,
  marketingLines,
  toGeneratedFile,
  toMarketingCss,
  toMarketingFile,
  toWebThemeCss,
  webFontStack,
  type MarketingInput,
  type WebThemeInput,
  type WebV2Input,
} from './css.js';
export { v2 } from './v2/index.js';
