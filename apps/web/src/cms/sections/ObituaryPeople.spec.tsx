import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { findHardCodedCopy } from '@griever/copy';
import { PRECEDED_RELATIONS, SURVIVOR_RELATIONS } from '@griever/shared';
import { ObituaryPeople } from './ObituaryPeople';

function setup(initial = '', relations: readonly string[] = SURVIVOR_RELATIONS) {
  const calls: string[] = [];
  function Harness() {
    const [value, setValue] = useState(initial);
    return (
      <ObituaryPeople
        heading="Survived by"
        relations={relations}
        value={value}
        onChange={(text) => {
          calls.push(text);
          setValue(text);
        }}
      />
    );
  }
  render(<Harness />);
  return { calls, user: userEvent.setup() };
}

const two = JSON.stringify([
  { name: 'Ann', city: 'Reno', relation: 'spouse' },
  { name: 'Bo', city: '', relation: 'child' },
]);

describe('ObituaryPeople', () => {
  it('is a fieldset with the heading as its legend', () => {
    setup();
    expect(screen.getByRole('group', { name: 'Survived by' })).toBeInTheDocument();
  });

  it('adds a row, focuses its Name, and writes the serialized JSON', async () => {
    const { calls, user } = setup();
    await user.click(screen.getByRole('button', { name: 'Add a person' }));
    const name = screen.getByRole('textbox', { name: 'Name, person 1' });
    expect(name).toHaveFocus();
    await user.type(name, 'Ann');
    await user.type(screen.getByRole('textbox', { name: 'City, person 1' }), 'Reno');
    expect(JSON.parse(calls[calls.length - 1])).toEqual([{ name: 'Ann', city: 'Reno', relation: 'spouse' }]);
  });

  it('changes a relation with a native select', async () => {
    const { calls, user } = setup(two);
    const select = screen.getByRole('combobox', { name: 'Relationship, person 2' });
    expect(select.tagName).toBe('SELECT');
    await user.selectOptions(select, 'Sibling');
    expect(JSON.parse(calls[calls.length - 1])[1].relation).toBe('sibling');
  });

  it('offers seven relations for survivors and four for preceded', () => {
    setup(two);
    expect(screen.getAllByRole('option')).toHaveLength(14);
  });

  it('labels every survivor relation from the copy', () => {
    setup(two);
    expect(
      Array.from(screen.getByRole('combobox', { name: 'Relationship, person 1' }).querySelectorAll('option')).map(
        (o) => o.textContent,
      ),
    ).toEqual([
      'Spouse',
      'Child',
      'Grandchild',
      'Great-grandchild',
      '2nd great-grandchild',
      'Sibling',
      'Parent',
    ]);
  });

  it('offers four relations for the preceded list', async () => {
    const { user } = setup('', PRECEDED_RELATIONS);
    await user.click(screen.getByRole('button', { name: 'Add a person' }));
    expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual([
      'Spouse',
      'Child',
      'Sibling',
      'Parent',
    ]);
  });

  it('removes a row by name and moves focus to the next row Name', async () => {
    const { calls, user } = setup(two);
    await user.click(screen.getByRole('button', { name: 'Remove Ann, person 1' }));
    expect(JSON.parse(calls[calls.length - 1])).toEqual([{ name: 'Bo', city: '', relation: 'child' }]);
    expect(screen.getByRole('textbox', { name: 'Name, person 1' })).toHaveFocus();
  });

  it('moves focus to Add a person after removing the last row', async () => {
    const { user } = setup(two);
    await user.click(screen.getByRole('button', { name: 'Remove Bo, person 2' }));
    expect(screen.getByRole('button', { name: 'Add a person' })).toHaveFocus();
  });

  it('removes an empty row found by its numbered name', async () => {
    const { calls, user } = setup();
    await user.click(screen.getByRole('button', { name: 'Add a person' }));
    await user.click(screen.getByRole('button', { name: 'Remove person 1' }));
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(calls[calls.length - 1]).toBe('');
    expect(screen.getByRole('button', { name: 'Add a person' })).toHaveFocus();
  });

  it('never names a remove button with only "Remove "', async () => {
    const { user } = setup();
    await user.click(screen.getByRole('button', { name: 'Add a person' }));
    await user.click(screen.getByRole('button', { name: 'Add a person' }));
    const names = screen.getAllByRole('button', { name: /^Remove/ }).map((b) => b.textContent);
    expect(names).toEqual(['Remove person 1', 'Remove person 2']);
  });

  it('gives remove and add buttons a 44 px minimum height', () => {
    setup(two);
    for (const b of screen.getAllByRole('button')) {
      expect(b.className).toContain('min-h-[44px]');
    }
  });

  it('stops at 40 rows and shows the limit', () => {
    const forty = JSON.stringify(
      Array.from({ length: 40 }, (_, i) => ({ name: `P${i}`, city: '', relation: 'child' })),
    );
    setup(forty);
    expect(screen.queryByRole('button', { name: 'Add a person' })).toBeNull();
    expect(screen.getByText('This list holds up to 40 people.')).toBeInTheDocument();
  });

  it('keeps a bad value when a row is added, and writes on the first edit', async () => {
    const { calls, user } = setup('not json');
    expect(screen.queryByRole('textbox')).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Add a person' }));
    expect(screen.getAllByRole('textbox')).toHaveLength(2);
    expect(calls).toEqual([]);
    await user.type(screen.getByRole('textbox', { name: 'Name, person 1' }), 'A');
    expect(calls).toHaveLength(1);
    expect(JSON.parse(calls[0])).toEqual([{ name: 'A', city: '', relation: 'spouse' }]);
  });

  it('gives two rows with the same name different remove names', () => {
    const same = JSON.stringify([
      { name: 'Ann', city: '', relation: 'child' },
      { name: 'Ann', city: '', relation: 'child' },
    ]);
    setup(same);
    expect(screen.getByRole('button', { name: 'Remove Ann, person 1' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Remove Ann, person 2' })).toBeInTheDocument();
  });

  it('announces a removal in one polite status region', async () => {
    const { user } = setup(two);
    const region = screen.getByRole('status');
    expect(region).toHaveAttribute('aria-live', 'polite');
    await user.click(screen.getByRole('button', { name: 'Remove Ann, person 1' }));
    expect(region).toHaveTextContent('Ann removed.');
    await user.click(screen.getByRole('button', { name: 'Add a person' }));
    await user.click(screen.getByRole('button', { name: 'Remove person 2' }));
    expect(region).toHaveTextContent('Person 2 removed.');
  });

  it('announces the limit when the 40th row is added', async () => {
    const thirtyNine = JSON.stringify(
      Array.from({ length: 39 }, (_, i) => ({ name: `P${i}`, city: '', relation: 'child' })),
    );
    const { user } = setup(thirtyNine);
    expect(screen.getByRole('status')).toBeEmptyDOMElement();
    await user.click(screen.getByRole('button', { name: 'Add a person' }));
    expect(screen.getByRole('status')).toHaveTextContent('This list holds up to 40 people.');
  });

  it('focuses Add a person after removing a row at 40 rows', async () => {
    const forty = JSON.stringify(
      Array.from({ length: 40 }, (_, i) => ({ name: `P${i}`, city: '', relation: 'child' })),
    );
    const { user } = setup(forty);
    await user.click(screen.getByRole('button', { name: 'Remove P39, person 40' }));
    expect(screen.getByRole('button', { name: 'Add a person' })).toHaveFocus();
  });

  it('holds no hard-coded copy', () => {
    const source = readFileSync(join(import.meta.dirname, 'ObituaryPeople.tsx'), 'utf8');
    expect(findHardCodedCopy(source, 'cmsObituary')).toEqual([]);
  });
});
