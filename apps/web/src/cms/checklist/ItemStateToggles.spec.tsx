import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { findHardCodedCopy } from '@griever/copy';
import type { ChecklistItemState } from '@griever/shared';
import { ItemStateToggles } from './ItemStateToggles';

function setup(state: ChecklistItemState | null) {
  const onChange = vi.fn();
  render(<ItemStateToggles state={state} onChange={onChange} groupLabel="Pick" />);
  return onChange;
}

describe('ItemStateToggles', () => {
  it('shows neither pressed when open', () => {
    setup(null);
    expect(screen.getByRole('button', { name: 'Done' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('button', { name: "Doesn't apply" })).toHaveAttribute('aria-pressed', 'false');
  });

  it('reports done, then not applicable', async () => {
    const onChange = setup(null);
    await userEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(onChange).toHaveBeenLastCalledWith('done');
    await userEvent.click(screen.getByRole('button', { name: "Doesn't apply" }));
    expect(onChange).toHaveBeenLastCalledWith('not_applicable');
  });

  it('switches from done to not applicable, and only one is pressed', async () => {
    const onChange = setup('done');
    expect(screen.getByRole('button', { name: 'Done' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: "Doesn't apply" })).toHaveAttribute('aria-pressed', 'false');
    await userEvent.click(screen.getByRole('button', { name: "Doesn't apply" }));
    expect(onChange).toHaveBeenCalledWith('not_applicable');
  });

  it('clears when the pressed one is pressed again', async () => {
    const onChange = setup('done');
    await userEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(onChange).toHaveBeenCalledWith(null);
  });

  it('clears a pressed not applicable', async () => {
    const onChange = setup('not_applicable');
    await userEvent.click(screen.getByRole('button', { name: "Doesn't apply" }));
    expect(onChange).toHaveBeenCalledWith(null);
  });

  it('works from the keyboard in order', async () => {
    const onChange = setup(null);
    await userEvent.tab();
    expect(screen.getByRole('button', { name: 'Done' })).toHaveFocus();
    await userEvent.keyboard('{Enter}');
    expect(onChange).toHaveBeenCalledWith('done');
    await userEvent.tab();
    expect(screen.getByRole('button', { name: "Doesn't apply" })).toHaveFocus();
  });

  it('holds no hard-coded copy', () => {
    const source = readFileSync(join(import.meta.dirname, 'ItemStateToggles.tsx'), 'utf8');
    expect(findHardCodedCopy(source, 'cmsChecklist')).toEqual([]);
  });
});
