import type { MomentKey, TemplateCategory } from './types.js';

/** Every template category maps to exactly one moment — the source of truth, not duplicated per caller. */
export const MOMENT_KEY_BY_CATEGORY: Record<TemplateCategory, MomentKey> = {
  announcement: 'announce',
  service: 'service',
  obituary: 'obituary',
  aftercare: 'thanks',
};
