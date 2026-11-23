# Sample brand files

SAMPLE ONLY. These files are a placeholder logo made for #583. There is no real brand yet. Replace them when one exists.

- `mark.svg`: square mark (a low sun over a horizon). Use for favicon, app icon, Clerk logo.
- The header wordmark is inline in `AppHeader.tsx` (mark paths plus the name as real text in Sora, v2 colour variables). There is no `wordmark.svg`: an SVG loaded as an image cannot use the page font.
- `mark.svg` colours are the old app tokens as hex: ink `#201e1d`, accent-700 `#006786`. The inline header mark uses the v2 heading and link variables instead. `mark.svg` (the favicon) switches to light ink and accent-400 `#62c5ee` in a dark colour scheme.
- No PNG export: the repo has no tool to make one without a new package.

To swap: replace `mark.svg` keeping the file name (`index.html` points at it) and update the inline mark in `AppHeader.tsx`.
