/** The v1 values the web theme is built from. */
export interface WebThemeInput {
  colors: Readonly<Record<string, string>>;
  fontSerifStack: string;
  /** Pixels, keyed like the `--space-*` custom properties. */
  spacing: Readonly<Record<string, number>>;
  /** Pixels, keyed like the `--radius-*` custom properties. */
  radius: Readonly<Record<string, number>>;
}

/**
 * The CSS text for the web theme: an `@theme` block (serif face, then colours) and a `:root` block
 * (space, then radius). Pure: the same input always gives the same text, in the input's key order.
 * Tailwind reads `@theme`; `:root` holds the plain custom properties it does not turn into utilities.
 */
export function toWebThemeCss(input: WebThemeInput): string {
  const theme = [`  --font-serif: ${input.fontSerifStack};`, ''];
  for (const [name, value] of Object.entries(input.colors)) {
    theme.push(`  --color-${name}: ${value};`);
  }
  const root: string[] = [];
  for (const [name, value] of Object.entries(input.spacing)) {
    root.push(`  --space-${name}: ${value}px;`);
  }
  root.push('');
  for (const [name, value] of Object.entries(input.radius)) {
    root.push(`  --radius-${name}: ${value}px;`);
  }
  return `@theme {\n${theme.join('\n')}\n}\n\n:root {\n${root.join('\n')}\n}\n`;
}
