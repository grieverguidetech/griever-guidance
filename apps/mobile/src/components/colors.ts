import { colors } from '@griever/tokens';

// Shared colours. The palette comes from @griever/tokens, the same values as the web theme. Every
// text colour here is at least 4.5:1 on white and every border at least 3:1 (WCAG AA); colors.spec.ts
// checks it. Check a new pair before adding it.
//
// ACCENT is accent-700, not the base accent #0088b0: the base accent is 4.08:1 on white, so it stays
// for decoration. Web makes the same choice (see .gg-btn-primary in apps/web/src/styles.css).
export const ACCENT = colors['accent-700']; // 6.39:1 on white; white on ACCENT is the same
export const ACCENT_TINT = colors['accent-100']; // selected-row fill
export const MUTED = colors['neutral-700']; // 6.52:1 on white
export const FIELD_BORDER = colors['neutral-600']; // input and checkbox outlines (4.30:1)
export const MUTED_STRONG = colors['neutral-800']; // secondary text that can sit on ACCENT_TINT

// Not in the web theme yet; kept here until web needs them and they move to @griever/tokens.
export const ERROR = '#b91c1c'; // 6.47:1 on white
export const SUCCESS = '#2f7a50'; // 5.22:1 on white
