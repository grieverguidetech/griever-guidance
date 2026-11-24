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
      onPeople={vi.fn()}
      onAccount={vi.fn()}
      aside={props.aside === false ? undefined : <p>Panel words</p>}
      title={props.title}
    >
      <h2>Details</h2>
    </CmsShell>
  );
}

/** The one toggle in the header. */
function headerToggle() {
  return within(screen.getByRole('banner')).getByRole('button', { name: "What you'll need" });
}

/** The phone button in the page; jsdom ignores lg:hidden, so it is found by its marker, not its name. */
function phoneButton() {
  return screen.getByRole('main').querySelector('[data-checklist-opener]') as HTMLElement;
}

afterEach(() => {
  vi.restoreAllMocks();
  window.localStorage.clear();
});

describe('CmsShell checklist panel', () => {
  it('always keeps the phone opener and the header toggle', () => {
    render(shell());
    expect(phoneButton()).toBeInTheDocument();
    expect(headerToggle()).toBeInTheDocument();
  });

  it('shows the panel by default, as a named aside with an expanded toggle', () => {
    render(shell());
    expect(within(screen.getByRole('complementary', { name: "What you'll need" })).getByText('Panel words')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: "What you'll need" })).toBeInTheDocument();
    const toggle = headerToggle();
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(toggle).toHaveAttribute('aria-controls', screen.getByRole('complementary').id);
  });

  it('has no Hide or Show checklist button anywhere, and the panel has no button of its own', () => {
    render(shell());
    expect(screen.queryByRole('button', { name: /checklist/i })).not.toBeInTheDocument();
    expect(within(screen.getByRole('complementary')).queryByRole('button')).not.toBeInTheDocument();
  });

  it('the one header toggle flips aria-expanded and the caret, keeps focus on itself, and closes and opens the panel', async () => {
    render(shell());
    const toggle = headerToggle();
    expect(within(toggle).getByTestId('checklist-caret')).toHaveAttribute('data-caret', 'down');
    const panelId = toggle.getAttribute('aria-controls') ?? '';
    expect(panelId).not.toBe('');
    await userEvent.click(toggle);
    expect(screen.queryByRole('complementary')).not.toBeInTheDocument();
    expect(headerToggle()).toBe(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(toggle).toHaveAttribute('aria-controls', panelId);
    expect(toggle).toHaveFocus();
    expect(within(toggle).getByTestId('checklist-caret')).toHaveAttribute('data-caret', 'up');
    await userEvent.click(toggle);
    expect(screen.getByRole('complementary', { name: "What you'll need" })).toHaveAttribute('id', panelId);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(toggle).toHaveFocus();
    expect(within(toggle).getByTestId('checklist-caret')).toHaveAttribute('data-caret', 'down');
  });

  it('draws no header toggle when there is no panel', () => {
    render(shell({ aside: false }));
    expect(within(screen.getByRole('banner')).queryByRole('button')).not.toBeInTheDocument();
  });

  it('makes the aside sticky and scrollable, with a focusable first child', () => {
    render(shell());
    const aside = screen.getByRole('complementary', { name: "What you'll need" });
    expect(aside).not.toHaveAttribute('tabindex');
    expect(aside.className).toContain('lg:sticky');
    expect(aside.className).toContain('lg:overflow-y-auto');
    expect(aside.className).toContain('lg:max-h-[calc(100dvh-2rem)]');
    expect(aside.className).toContain('lg:w-96');
    expect(aside.className).toContain('lg:shrink-0');
  });

  it('spaces the panel title from its content by the page gap (gap-4 = 16px) (#1069)', () => {
    render(shell());
    const aside = screen.getByRole('complementary', { name: "What you'll need" });
    expect(aside.className).toContain('lg:flex');
    expect(aside.className).toContain('lg:flex-col');
    expect(aside.className).toContain('lg:gap-4');
  });

  it('keeps the phone button from stretching the title row, so the gap below the h1 is the page gap (#1069)', () => {
    render(shell());
    const row = screen.getByTestId('title-row');
    expect(row.className).toContain('gap-y-4');
    expect(document.querySelector('[data-checklist-opener]')).toHaveClass('-my-2');
    expect(row.parentElement).toHaveClass('gap-4'); // the main column's rhythm
  });

  it('puts empty live regions in one wrapper so they add no gap, and keeps them rendered (#1069)', () => {
    render(
      <CmsShell
        personName="Margaret Hale"
        section="service"
        onSelect={vi.fn()}
        onPeople={vi.fn()}
        onAccount={vi.fn()}
        notice={
          <>
            <div role="status" aria-live="polite" data-testid="live-a" />
            <div role="status" aria-live="polite" data-testid="live-b" />
            <div aria-hidden="true" data-testid="live-c" />
          </>
        }
      >
        <h2>Details</h2>
      </CmsShell>,
    );
    const main = screen.getByRole('main');
    const slot = screen.getByTestId('notice-slot');
    expect(slot.parentElement).toBe(main);
    expect(slot).toHaveClass('-mb-4'); // cancels the one gap after the wrapper
    for (const id of ['live-a', 'live-b', 'live-c']) {
      const region = screen.getByTestId(id);
      expect(region.parentElement).toBe(slot); // not a gap-taking child of main
      expect(region).toBeEmptyDOMElement();
      expect(region).toBeInTheDocument();
      expect(region).not.toHaveAttribute('hidden');
      expect(region.className).not.toContain('hidden');
    }
    expect(main).toHaveClass('gap-4');
  });

  it('wraps the section content in a keyed gg-enter div that remounts on section change', () => {
    const props = { personName: 'Margaret Hale', onSelect: vi.fn(), onPeople: vi.fn(), onAccount: vi.fn() };
    const { rerender } = render(
      <CmsShell {...props} section="service"><h2>Details</h2></CmsShell>,
    );
    const first = screen.getByRole('heading', { name: 'Details' }).parentElement as HTMLElement;
    expect(first).toHaveClass('gg-enter');
    rerender(<CmsShell {...props} section="service" title="Other"><h2>Details</h2></CmsShell>);
    const second = screen.getByRole('heading', { name: 'Details' }).parentElement as HTMLElement;
    expect(second).toHaveClass('gg-enter');
    expect(second).not.toBe(first);
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
  });

  it('hides, saves the choice, and is still hidden after a remount', async () => {
    const { unmount } = render(shell());
    await userEvent.click(headerToggle());
    expect(screen.queryByRole('complementary')).not.toBeInTheDocument();
    expect(headerToggle()).toHaveAttribute('aria-expanded', 'false');
    expect(window.localStorage.getItem(KEY)).toBe('hidden');
    unmount();
    render(shell());
    expect(screen.queryByRole('complementary')).not.toBeInTheDocument();
    await userEvent.click(headerToggle());
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
    await userEvent.click(headerToggle());
    expect(screen.queryByRole('complementary')).not.toBeInTheDocument();
  });

  it('opens the sheet from the phone button, and Close returns focus to it', async () => {
    render(shell());
    const open = phoneButton();
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
    const open = phoneButton();
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
    await userEvent.click(phoneButton());
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
      <CmsShell personName="Margaret Hale" section="service" onSelect={vi.fn()} onPeople={vi.fn()} onAccount={vi.fn()}
        aside={({ inSheet, closeSheet }) => (
          <button type="button" onClick={closeSheet}>{inSheet ? 'In sheet' : 'In panel'}</button>
        )}
      >
        <h2>Details</h2>
      </CmsShell>,
    );
    expect(screen.getByRole('button', { name: 'In panel' })).toBeInTheDocument();
    await user.click(within(screen.getByRole('main')).getByRole('button', { name: "What you'll need" }));
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
