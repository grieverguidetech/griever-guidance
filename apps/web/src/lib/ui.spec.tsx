import { fireEvent, render, screen } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { useFocusHeadingOnChange, TopBar } from './ui';

function Screen({ view, headingFrom, tick }: { view: string; headingFrom: number; tick: number }) {
  useFocusHeadingOnChange(view);
  // The heading only exists from render `headingFrom` on, like a screen that is still checking.
  return tick >= headingFrom ? <h1>{view}</h1> : <p>Checking</p>;
}

describe('useFocusHeadingOnChange', () => {
  it('focuses a heading that appears a render after the view changed', () => {
    const { rerender } = render(<Screen view="a" headingFrom={0} tick={0} />);
    expect(document.activeElement).toBe(document.body);
    fireEvent.click(document.body);

    rerender(<Screen view="b" headingFrom={2} tick={1} />);
    expect(screen.queryByRole('heading')).not.toBeInTheDocument();
    expect(document.activeElement).toBe(document.body);

    rerender(<Screen view="b" headingFrom={2} tick={2} />);
    expect(document.activeElement).toBe(screen.getByRole('heading', { level: 1, name: 'b' }));
  });

  it('does not refocus on a later render of the same view', () => {
    const { rerender } = render(<Screen view="a" headingFrom={0} tick={0} />);
    fireEvent.click(document.body);
    rerender(<Screen view="b" headingFrom={0} tick={1} />);
    (document.activeElement as HTMLElement).blur();
    rerender(<Screen view="b" headingFrom={0} tick={2} />);
    expect(document.activeElement).toBe(document.body);
  });

  it('focuses with a plain focus() when no router move is given (a flow step scrolls the h1 into view)', () => {
    const focus = vi.spyOn(HTMLElement.prototype, 'focus');
    try {
      const { rerender } = render(<Screen view="a" headingFrom={0} tick={0} />);
      fireEvent.click(document.body);
      rerender(<Screen view="b" headingFrom={0} tick={1} />);
      expect(focus).toHaveBeenCalledTimes(1);
      expect(focus).toHaveBeenCalledWith();
    } finally {
      focus.mockRestore();
    }
  });
});

describe('useFocusHeadingOnChange with router moves (#852)', () => {
  type Move = { view: string; locationKey: string; type: 'POP' | 'PUSH' | 'REPLACE' };
  function Routed({ view, locationKey, type }: Move) {
    useFocusHeadingOnChange(view, { locationKey, type });
    return (
      <>
        <nav>
          <a href="/here" aria-current="page">
            Here
          </a>
        </nav>
        <h1>{view}</h1>
      </>
    );
  }

  const ABOVE = { top: -240, bottom: -200, left: 0, right: 100, width: 100, height: 40, x: 0, y: -240 } as DOMRect;
  const BELOW = { top: 5000, bottom: 5040, left: 0, right: 100, width: 100, height: 40, x: 0, y: 5000 } as DOMRect;
  const IN_VIEW = { top: 16, bottom: 56, left: 0, right: 100, width: 100, height: 40, x: 0, y: 16 } as DOMRect;

  /** Renders view "a" at entry "k1", marks a press, then moves to view "b" with `move`. */
  function moveTo(move: Omit<Move, 'view'>, rects: { heading?: DOMRect; link?: DOMRect } = {}) {
    const focus = vi.spyOn(HTMLElement.prototype, 'focus');
    const { rerender } = render(<Routed view="a" locationKey="k1" type="PUSH" />);
    const heading = screen.getByRole('heading', { level: 1 });
    const link = screen.getByRole('link', { name: 'Here' });
    if (rects.heading) {
      vi.spyOn(heading, 'getBoundingClientRect').mockReturnValue(rects.heading);
    }
    if (rects.link) {
      vi.spyOn(link, 'getBoundingClientRect').mockReturnValue(rects.link);
    }
    fireEvent.click(document.body);
    rerender(<Routed view="b" {...move} />);
    return { focus, heading, link };
  }

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('a change on the same URL is a step: plain focus, which may scroll', () => {
    const { focus, heading } = moveTo({ locationKey: 'k1', type: 'PUSH' });
    expect(document.activeElement).toBe(heading);
    expect(focus).toHaveBeenCalledWith();
  });

  it.each(['PUSH', 'REPLACE'] as const)('%s: the h1, without scrolling (the page is already at the top)', (type) => {
    const { focus, heading } = moveTo({ locationKey: 'k2', type }, { heading: BELOW });
    expect(document.activeElement).toBe(heading);
    expect(focus).toHaveBeenCalledTimes(1);
    expect(focus).toHaveBeenCalledWith({ preventScroll: true });
  });

  it('POP with the h1 in view: the h1, without scrolling', () => {
    const { focus, heading } = moveTo({ locationKey: 'k0', type: 'POP' }, { heading: IN_VIEW });
    expect(document.activeElement).toBe(heading);
    expect(focus).toHaveBeenCalledWith({ preventScroll: true });
  });

  it("POP with the h1 above the view: the side nav's current link, if it is in view", () => {
    const { focus, link } = moveTo({ locationKey: 'k0', type: 'POP' }, { heading: ABOVE, link: IN_VIEW });
    expect(document.activeElement).toBe(link);
    expect(focus).toHaveBeenCalledTimes(1);
    expect(focus).toHaveBeenCalledWith({ preventScroll: true });
  });

  it('POP with neither in view: focus stays where it was, so the restored scroll stays', () => {
    const { focus } = moveTo({ locationKey: 'k0', type: 'POP' }, { heading: ABOVE, link: BELOW });
    expect(focus).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(document.body);
  });
});

describe('useFocusHeadingOnChange, before any press', () => {
  it('stays put when the view changes before the person has done anything', () => {
    const { rerender } = render(<Screen view="a" headingFrom={0} tick={0} />);
    rerender(<Screen view="b" headingFrom={0} tick={1} />);
    expect(document.activeElement).toBe(document.body);
  });
});

describe('top buttons (#176)', () => {
  const css = readFileSync(join(import.meta.dirname, '..', 'styles.css'), 'utf8');

  it('Back is a bordered secondary button and What you will need is also secondary (#1075)', () => {
    render(<TopBar onBack={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Back' })).toHaveClass('gg-btn-secondary');
    expect(screen.getByRole('button', { name: "What you'll need" })).toHaveClass('gg-btn-secondary');
    for (const name of ['Back', "What you'll need"]) {
      const button = screen.getByRole('button', { name });
      expect(button).not.toHaveClass('!px-0'); // padding is kept
    }
  });

  it('Back centres its icon on the label with a 10px gap and keeps its width (#1069)', () => {
    render(<TopBar onBack={vi.fn()} />);
    const button = screen.getByRole('button', { name: 'Back' });
    expect(button).toHaveClass('gap-[var(--space-2)]', 'px-4');
    const icon = button.querySelector('svg');
    expect(icon).toHaveClass('block', 'shrink-0');
    // The base button is inline-flex with items-center and min-height 44px; the width is 2 x 18 + 6 before and 2 x 16 + 10 now.
    expect(css).toMatch(/\.gg-btn,\s*\[data-gg-btn\]\s*{[^}]*display:\s*inline-flex;[^}]*align-items:\s*center;[^}]*gap:\s*6px;[^}]*min-height:\s*44px;[^}]*padding:\s*var\(--space-2\) calc\(var\(--space-3\) \* 1\.2\)/);
  });

  it('tertiary buttons are underlined, with link-colour text at rest and hover and heading-colour text when active', () => {
    expect(css).toMatch(/\.gg-btn-tertiary,\s*\[data-gg-btn='tertiary'\]\s*{[^}]*text-decoration:\s*underline/);
    expect(css).toMatch(/\.gg-btn-tertiary,\s*\[data-gg-btn='tertiary'\]\s*{[^}]*color:\s*var\(--color-v2-link\)/);
    expect(css).toMatch(/\.gg-btn-plain:not\(:disabled\):active\s*{[^}]*color:\s*var\(--color-v2-heading\)/);
    expect(css).toMatch(/\.gg-btn-plain\s*{[^}]*color:\s*var\(--color-v2-link\)/);
    expect(css).not.toMatch(/\.gg-btn-plain\s*{[^}]*text-decoration/);
    expect(css).toMatch(/\.gg-check-box\s*{[^}]*border:\s*2px solid var\(--color-v2-muted\)/);
  });

  it('the shared styles keep them at least 44 by 44 with a border', () => {
    expect(css).toMatch(/\.gg-btn,\s*\[data-gg-btn\]\s*{[^}]*min-height:\s*44px/);
    expect(css).toMatch(/\.gg-btn-secondary,\s*\[data-gg-btn='secondary'\]\s*{[^}]*min-width:\s*44px/);
    expect(css).toMatch(/\.gg-btn-secondary,\s*\[data-gg-btn='secondary'\]\s*{[^}]*border-color:/);
    expect(css).toMatch(/\.gg-btn,\s*\[data-gg-btn\]\s*{[^}]*border:\s*1px solid/);
  });

  it('the secondary outline is transparent with a link-colour edge and text, the same as the mobile header button', () => {
    expect(css).toMatch(/\.gg-btn-secondary,\s*\[data-gg-btn='secondary'\]\s*{[^}]*background:\s*transparent/);
    expect(css).toMatch(/\.gg-btn-secondary,\s*\[data-gg-btn='secondary'\]\s*{[^}]*border-color:\s*var\(--color-v2-outline-border\)/);
    expect(css).toMatch(/\.gg-btn-secondary,\s*\[data-gg-btn='secondary'\]\s*{[^}]*color:\s*var\(--color-v2-outline-text\)/);
  });
});
