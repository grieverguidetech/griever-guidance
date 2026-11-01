# Sample brand files

SAMPLE ONLY. These files are a placeholder logo made for #583. There is no real brand yet. Replace them when one exists.

- `mark.svg`: square mark (a low sun over a horizon). Use for favicon, app icon, Clerk logo.
- `wordmark.svg`: mark plus "Grievers Guidance". The name is a `<text>` element (system serif font stack), not outlines, so it can look slightly different per device.
- Colours are the app tokens as hex: ink `#201e1d`, accent-700 `#006786`. In a dark colour scheme the files switch to light ink and accent-400 `#62c5ee`.
- No PNG export: the repo has no tool to make one without a new package.

To swap: replace the two SVGs keeping the same file names. `AppHeader.tsx` and `index.html` point at them.
