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

  it('stays put when the view changes before the person has done anything', () => {
    const { rerender } = render(<Screen view="a" headingFrom={0} tick={0} />);
    rerender(<Screen view="b" headingFrom={0} tick={1} />);
    expect(document.activeElement).toBe(document.body);
  });
});

describe('top buttons (#176)', () => {
  const css = readFileSync(join(import.meta.dirname, '..', 'styles.css'), 'utf8');

  it('Back and What you will need are bordered buttons, not bare links', () => {
    render(<TopBar onBack={vi.fn()} />);
    for (const name of ['Back', "What you'll need"]) {
      const button = screen.getByRole('button', { name });
      expect(button).toHaveClass('gg-btn-secondary'); // the visible border
      expect(button).toHaveClass('gg-btn-bar');
      expect(button).not.toHaveClass('!px-0'); // padding is kept
      expect(button).not.toHaveClass('gg-btn-ghost');
    }
  });

  it('the shared styles keep them at least 44 by 44 with a border', () => {
    expect(css).toMatch(/\.gg-btn\s*{[^}]*min-height:\s*44px/);
    expect(css).toMatch(/\.gg-btn-bar\s*{[^}]*min-width:\s*44px/);
    expect(css).toMatch(/\.gg-btn-secondary\s*{[^}]*border-color:/);
    expect(css).toMatch(/\.gg-btn\s*{[^}]*border:\s*1px solid/);
  });
});
