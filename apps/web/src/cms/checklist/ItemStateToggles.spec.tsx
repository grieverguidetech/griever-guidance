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
  it('shows only Done, not pressed when open, and no Doesn\'t apply', () => {
    setup(null);
    expect(screen.getByRole('button', { name: 'Done' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.queryByRole('button', { name: "Doesn't apply" })).toBeNull();
    expect(screen.getAllByRole('button')).toHaveLength(1);
  });

  it('reports done', async () => {
    const onChange = setup(null);
    await userEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(onChange).toHaveBeenLastCalledWith('done');
  });

  it('shows a hidden check inside the pressed button', () => {
    setup('done');
    expect(screen.getByRole('button', { name: 'Done' }).querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
  });

  it('clears when the pressed one is pressed again', async () => {
    const onChange = setup('done');
    await userEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(onChange).toHaveBeenCalledWith(null);
  });

  it('shows a saved not_applicable as done, keeps it described, and clears on press', async () => {
    const onChange = setup('not_applicable');
    const done = screen.getByRole('button', { name: 'Done' });
    expect(done).toHaveAttribute('aria-pressed', 'true');
    expect(done).toHaveAccessibleDescription("Doesn't apply");
    await userEvent.click(done);
    expect(onChange).toHaveBeenCalledWith(null);
  });

  it('works from the keyboard', async () => {
    const onChange = setup(null);
    await userEvent.tab();
    expect(screen.getByRole('button', { name: 'Done' })).toHaveFocus();
    await userEvent.keyboard('{Enter}');
    expect(onChange).toHaveBeenCalledWith('done');
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

    it('puts Done first, then the label, with no Doesn\'t apply, in a named group', () => {
      setupRow(null);
      const group = screen.getByRole('group', { name: 'Pick' });
      expect(within(group).getAllByRole('button').map((b) => b.getAttribute('aria-label') ?? b.textContent)).toEqual([
        'Done',
        'Label',
      ]);
    });

    it('names Done by label only, with a hidden icon, and sets aria-pressed', () => {
      setupRow('done');
      const done = screen.getByRole('button', { name: 'Done' });
      expect(done).toHaveAttribute('aria-pressed', 'true');
      expect(done.textContent).toBe('');
      expect(done.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
      expect(screen.queryByRole('button', { name: "Doesn't apply" })).toBeNull();
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

    it('is a 44px circle', () => {
      setupRow(null);
      expect(screen.getByRole('button', { name: 'Done' })).toHaveClass('size-11', 'rounded-full');
    });

    it('asks for done when an open row is pressed', async () => {
      const onChange = setupRow(null);
      await userEvent.click(screen.getByRole('button', { name: 'Done' }));
      expect(onChange).toHaveBeenLastCalledWith('done');
    });

    it('clears a done row on press', async () => {
      const onChange = setupRow('done');
      await userEvent.click(screen.getByRole('button', { name: 'Done' }));
      expect(onChange).toHaveBeenLastCalledWith(null);
    });

    it('describes a saved not_applicable row as Doesn\'t apply, after the label', () => {
      render(
        <ItemStateToggles variant="row" state="not_applicable" onChange={vi.fn()} groupLabel="x" labelId="lbl">
          <button type="button" id="lbl">
            Row label
          </button>
        </ItemStateToggles>,
      );
      expect(screen.getByRole('button', { name: 'Done' })).toHaveAccessibleDescription("Row label Doesn't apply");
    });

    it('shows a saved "doesn\'t apply" as finished, and press clears it', async () => {
      const onChange = setupRow('not_applicable');
      const done = screen.getByRole('button', { name: 'Done' });
      expect(done).toHaveAttribute('aria-pressed', 'true');
      await userEvent.click(done);
      expect(onChange).toHaveBeenLastCalledWith(null);
    });
  });

  it('holds no hard-coded copy', () => {
    const source = readFileSync(join(import.meta.dirname, 'ItemStateToggles.tsx'), 'utf8');
    expect(findHardCodedCopy(source, 'cmsChecklist')).toEqual([]);
  });
});
