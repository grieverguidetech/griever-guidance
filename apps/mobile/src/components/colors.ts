import { v2 } from '@griever/tokens';

// Shared colours, read from the v2 roles in @griever/tokens. Every text colour here is at least
// 4.5:1 on white and every border at least 3:1 (WCAG AA); colors.spec.ts checks it. Check a new
// pair before adding it.
const { roles, recipes } = v2;

export const ACCENT = roles.link; // 6.39:1 on white; white on ACCENT is the same
export const ACCENT_TINT = roles.wash; // selected-row fill
export const MUTED = roles.muted; // 6.52:1 on white
export const FIELD_BORDER = recipes.field.edge; // input and checkbox outlines (4.30:1)
export const MUTED_STRONG = roles.mutedStrong; // secondary text that can sit on ACCENT_TINT
export const ERROR = roles.error; // web value (D2)
export const SUCCESS = roles.success; // web value (D2)
