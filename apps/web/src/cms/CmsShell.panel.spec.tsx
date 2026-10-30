import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { findHardCodedCopy } from '@griever/copy';
import { CmsShell } from './CmsShell';

const KEY = 'gg.cmsChecklistPanel.v1';

function shell(props: { aside?: boolean; title?: string } = {}) {
  return (
    <CmsShell
      personName="Margaret Hale"
      section="service"
      onSelect={vi.fn()}
      onChangePerson={vi.fn()}
      onAccount={vi.fn()}
      aside={props.aside === false ? undefined : <p>Panel words</p>}
      title={props.title}
    >
      <h2>Details</h2>
    </CmsShell>
  );
}

afterEach(() => {
  vi.restoreAllMocks();
  window.localStorage.clear();
});

describe('CmsShell checklist panel', () => {
  it('shows the panel by default, as a named aside with an expanded toggle', () => {
    render(shell());
    expect(within(screen.getByRole('complementary', { name: "What you'll need" })).getByText('Panel words')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: "What you'll need" })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Hide checklist' })).not.toHaveAttribute('aria-expanded');
  });

  it('hides, saves the choice, and is still hidden after a remount', async () => {
    const { unmount } = render(shell());
    await userEvent.click(screen.getByRole('button', { name: 'Hide checklist' }));
    expect(screen.queryByRole('complementary')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Show checklist' })).toBeInTheDocument();
    expect(window.localStorage.getItem(KEY)).toBe('hidden');
    unmount();
    render(shell());
    expect(screen.queryByRole('complementary')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Show checklist' }));
    expect(window.localStorage.getItem(KEY)).toBe('shown');
    expect(screen.getByRole('complementary')).toBeInTheDocument();
  });

  it('falls back to shown when storage throws on read, and does not throw on write', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    render(shell());
    expect(screen.getByRole('complementary')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Hide checklist' }));
    expect(screen.queryByRole('complementary')).not.toBeInTheDocument();
  });

  it('opens the sheet from the phone button, and Close returns focus to it', async () => {
    render(shell());
    const open = screen.getByRole('button', { name: "What you'll need" });
    await userEvent.click(open);
    const dialog = screen.getByRole('dialog', { name: "What you'll need" });
    expect(screen.getAllByText('Panel words')).toHaveLength(1);
    expect(dialog).toContainElement(screen.getByText('Panel words'));
    expect(within(dialog).getByRole('heading', { name: "What you'll need" })).toHaveFocus();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(open).toHaveFocus();
  });

  it('Escape closes the sheet and returns focus to the button', async () => {
    render(shell());
    const open = screen.getByRole('button', { name: "What you'll need" });
    await userEvent.click(open);
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(open).toHaveFocus();
  });

  it('closes the sheet when the screen grows to lg', async () => {
    let listener: ((e: { matches: boolean }) => void) | undefined;
    window.matchMedia = vi.fn().mockImplementation(() => ({
      matches: false,
      addEventListener: (_: string, fn: typeof listener) => {
        listener = fn;
      },
      removeEventListener: vi.fn(),
    }));
    render(shell());
    await userEvent.click(screen.getByRole('button', { name: "What you'll need" }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    act(() => listener?.({ matches: true }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    // @ts-expect-error restore the jsdom default (no matchMedia)
    delete window.matchMedia;
  });

  it('title replaces the single h1 text', () => {
    render(shell({ title: 'Pronouncement' }));
    const h1 = screen.getAllByRole('heading', { level: 1 });
    expect(h1).toHaveLength(1);
    expect(h1[0]).toHaveTextContent('Pronouncement');
  });

  it('gives a function aside the sheet flag and a close that shuts the sheet', async () => {
    const user = userEvent.setup();
    render(
      <CmsShell personName="Margaret Hale" section="service" onSelect={vi.fn()} onChangePerson={vi.fn()} onAccount={vi.fn()}
        aside={({ inSheet, closeSheet }) => (
          <button type="button" onClick={closeSheet}>{inSheet ? 'In sheet' : 'In panel'}</button>
        )}
      >
        <h2>Details</h2>
      </CmsShell>,
    );
    expect(screen.getByRole('button', { name: 'In panel' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: "What you'll need" }));
    const dialog = screen.getByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'In sheet' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('with no aside, renders no panel, toggle or phone button', () => {
    render(shell({ aside: false }));
    expect(screen.queryByRole('complementary')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /checklist|what you'll need/i })).not.toBeInTheDocument();
    const h1 = screen.getByRole('heading', { level: 1 });
    expect(h1).toHaveTextContent('Service');
    // Same as #391: the h1 sits directly in <main>, with no wrapper.
    expect(h1.parentElement?.tagName).toBe('MAIN');
  });

  it('holds no hard-coded copy', () => {
    const source = readFileSync(join(import.meta.dirname, 'CmsShell.tsx'), 'utf8');
    expect(findHardCodedCopy(source, 'cmsChecklist')).toEqual([]);
  });
});
