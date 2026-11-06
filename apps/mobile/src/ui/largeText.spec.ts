import { describe, expect, it } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const src = join(__dirname, '..');

/** The text of one style entry, for example `topBar: { ... },`, up to its closing brace. */
function styleBlock(file: string, name: string): string {
  const source = readFileSync(join(src, file), 'utf8');
  const start = source.search(new RegExp(`^\\s+${name}:\\s*\\{`, 'm'));
  expect(start).toBeGreaterThanOrEqual(0);
  const end = source.indexOf('}', start);
  return source.slice(start, end);
}

// A row that holds two controls must wrap at the largest text size (#654), or one runs off screen.
const WRAPPING_ROWS: Array<[string, string]> = [
  ['ui/screens/Hub.tsx', 'topBar'],
  ['ui/screens/Announce.tsx', 'topBar'],
  ['ui/screens/WhoShouldKnow.tsx', 'topBar'],
  ['ui/screens/WhoShouldKnow.tsx', 'footerRow'],
  ['ui/screens/WhoShouldKnow.tsx', 'sectionHead'],
  ['ui/screens/ReadyToSend.tsx', 'topBar'],
  ['ui/screens/Account.tsx', 'topBar'],
  ['ui/screens/Sending.tsx', 'topBar'],
  ['ui/screens/Sending.tsx', 'person'],
  ['screens/ContactSelectorScreen.tsx', 'topBar'],
  ['ui/screens/PersonSetup.tsx', 'topBar'],
  ['ui/screens/ShareObituary.tsx', 'topBar'],
  ['ui/ActionBar.tsx', 'above'],
];

describe('rows that hold two controls wrap and keep a gap (#654)', () => {
  it.each(WRAPPING_ROWS)('%s %s', (file, name) => {
    const block = styleBlock(file, name);
    expect(block).toMatch(/flexWrap:\s*'wrap'/);
    expect(block).toMatch(/gap:/);
  });
});

describe('inputs are at least 15 pt (#654)', () => {
  it.each([
    ['ui/screens/WhoShouldKnow.tsx', 'input'],
    ['ui/screens/ReadyToSend.tsx', 'input'],
    ['ui/screens/Account.tsx', 'input'],
    ['ui/screens/Announce.tsx', 'input'],
    ['components/DetailsRow.tsx', 'input'],
    ['components/SavedNote.tsx', 'note'],
    ['ui/screens/PersonSetup.tsx', 'input'],
    ['ui/screens/ShareObituary.tsx', 'input'],
  ])('%s %s', (file, name) => {
    const size = /fontSize:\s*(\d+)/.exec(styleBlock(file, name));
    expect(Number(size?.[1])).toBeGreaterThanOrEqual(15);
  });
});

describe('text is at least 15 pt (#654)', () => {
  it.each([
    ['screens/ContactsStepScreen.tsx', 'empty'],
    ['screens/ContactsStepScreen.tsx', 'reason'],
    ['screens/ContactsStepScreen.tsx', 'name'],
    ['screens/ContactsStepScreen.tsx', 'phone'],
    ['screens/ContactsStepScreen.tsx', 'count'],
    ['screens/ContactsStepScreen.tsx', 'eyebrow'],
    ['screens/ContactsStepScreen.tsx', 'status'],
    ['screens/ContactsStepScreen.tsx', 'note'],
    ['ui/screens/WhoShouldKnow.tsx', 'error'],
  ])('%s %s', (file, name) => {
    const size = /fontSize:\s*(\d+)/.exec(styleBlock(file, name));
    expect(Number(size?.[1])).toBeGreaterThanOrEqual(15);
  });
});
