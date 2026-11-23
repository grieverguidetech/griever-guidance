import { primitives } from './primitives.js';
import { recipes } from './recipes.js';
import { roles } from './roles.js';

export { buildRecipes } from './recipes.js';
export { buildRoles } from './roles.js';
export type { Gradient, Primitives, Shadow } from './primitives.js';

/** Design tokens v2: primitives, then roles, then recipes. Web and mobile read this. */
export const v2 = { primitives, roles, recipes };
