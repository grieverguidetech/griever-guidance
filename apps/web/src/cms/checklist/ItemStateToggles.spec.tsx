import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { render, screen, within } from '@testing-library/react';
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

  it('switches from done to not applicable when the other is pressed', async () => {
    const onChange = setup('done');
    expect(screen.getByRole('button', { name: 'Done' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: "Doesn't apply" })).toHaveAttribute('aria-pressed', 'false');
    await userEvent.click(screen.getByRole('button', { name: "Doesn't apply" }));
    expect(onChange).toHaveBeenCalledWith('not_applicable');
  });

  it('shows a hidden check inside the pressed button only', () => {
    setup('done');
    expect(screen.getByRole('button', { name: 'Done' }).querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
    expect(screen.getByRole('button', { name: "Doesn't apply" }).querySelector('svg')).toBeNull();
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

  describe('row variant', () => {
    function setupRow(state: ChecklistItemState | null) {
      const onChange = vi.fn();
      render(
        <ItemStateToggles variant="row" state={state} onChange={onChange} groupLabel="Pick">
          <button type="button">Label</button>
        </ItemStateToggles>,
      );
      return onChange;
    }

    it('puts Done first, the label between, and Doesn\'t apply last, in a named group', () => {
      setupRow(null);
      const group = screen.getByRole('group', { name: 'Pick' });
      expect(within(group).getAllByRole('button').map((b) => b.getAttribute('aria-label') ?? b.textContent)).toEqual([
        'Done',
        'Label',
        "Doesn't apply",
      ]);
    });

    it('names Done by label only, with a hidden icon, and sets aria-pressed', () => {
      setupRow('done');
      const done = screen.getByRole('button', { name: 'Done' });
      expect(done).toHaveAttribute('aria-pressed', 'true');
      expect(done.textContent).toBe('');
      expect(done.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
      expect(screen.getByRole('button', { name: "Doesn't apply" })).toHaveAttribute('aria-pressed', 'false');
    });

    it('uses a different icon for open and done', () => {
      const { unmount } = render(
        <ItemStateToggles variant="row" state={null} onChange={vi.fn()} groupLabel="a" />,
      );
      const open = screen.getByRole('button', { name: 'Done' }).innerHTML;
      unmount();
      render(<ItemStateToggles variant="row" state="done" onChange={vi.fn()} groupLabel="a" />);
      expect(screen.getByRole('button', { name: 'Done' }).innerHTML).not.toBe(open);
    });

    it('names the group from the label button and describes Done with it', () => {
      render(
        <ItemStateToggles variant="row" state={null} onChange={vi.fn()} groupLabel="ignored" labelId="lbl">
          <button type="button" id="lbl">
            Row label
          </button>
        </ItemStateToggles>,
      );
      const group = screen.getByRole('group', { name: 'Row label' });
      expect(group).not.toHaveAttribute('aria-label');
      const done = within(group).getByRole('button', { name: 'Done' });
      expect(done).toHaveAccessibleDescription('Row label');
    });

    it('is a 44px circle and a chip', () => {
      setupRow(null);
      expect(screen.getByRole('button', { name: 'Done' })).toHaveClass('size-11', 'rounded-full');
      expect(screen.getByRole('button', { name: "Doesn't apply" })).toHaveClass('gg-chip');
    });

    it('switches and clears like the detail variant', async () => {
      const onChange = setupRow('done');
      await userEvent.click(screen.getByRole('button', { name: "Doesn't apply" }));
      expect(onChange).toHaveBeenLastCalledWith('not_applicable');
      await userEvent.click(screen.getByRole('button', { name: 'Done' }));
      expect(onChange).toHaveBeenLastCalledWith(null);
    });
  });

  it('holds no hard-coded copy', () => {
    const source = readFileSync(join(import.meta.dirname, 'ItemStateToggles.tsx'), 'utf8');
    expect(findHardCodedCopy(source, 'cmsChecklist')).toEqual([]);
  });
});
