import { useState, type ReactNode } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { screenCopy } from '@griever/copy';
import { AccordionSection } from './AccordionSection';

const copy = screenCopy('cmsChecklist');

function Harness({
  level,
  done,
  startOpen = false,
  children = <input aria-label="Inside" />,
}: {
  level?: 2 | 3;
  done?: boolean;
  startOpen?: boolean;
  children?: ReactNode;
}) {
  const [open, setOpen] = useState(startOpen);
  return (
    <AccordionSection
      title="Their life"
      open={open}
      panelId="panel"
      onToggle={() => setOpen((v) => !v)}
      level={level}
      done={done}
      headingId="head"
    >
      {children}
    </AccordionSection>
  );
}

describe('AccordionSection', () => {
  it('is a level 3 heading by default and level 2 when asked', () => {
    const { unmount } = render(<Harness />);
    expect(screen.getByRole('heading', { level: 3, name: 'Their life' })).toHaveAttribute('id', 'head');
    unmount();
    render(<Harness level={2} />);
    expect(screen.getByRole('heading', { level: 2, name: 'Their life' })).toBeInTheDocument();
  });

  it('has aria-expanded and aria-controls, and hides the panel while closed', () => {
    render(<Harness />);
    const button = screen.getByRole('button', { name: 'Their life' });
    expect(button).toHaveAttribute('aria-expanded', 'false');
    expect(button).toHaveAttribute('aria-controls', 'panel');
    expect(document.getElementById('panel')).toHaveAttribute('hidden');
    expect(screen.queryByRole('textbox')).toBeNull();
  });

  it('opens and closes on click, turns the caret, and keeps focus on the button', async () => {
    render(<Harness />);
    const button = screen.getByRole('button', { name: 'Their life' });
    const caret = button.querySelector('[data-chevron]');
    await userEvent.click(button);
    expect(button).toHaveAttribute('aria-expanded', 'true');
    expect(document.getElementById('panel')).not.toHaveAttribute('hidden');
    expect(caret).toHaveClass('rotate-180');
    expect(button).toHaveFocus();
    await userEvent.click(button);
    expect(button).toHaveAttribute('aria-expanded', 'false');
    expect(caret).not.toHaveClass('rotate-180');
    expect(button).toHaveFocus();
  });

  it('keeps a typed value in the panel while it is closed', async () => {
    render(<Harness startOpen />);
    await userEvent.type(screen.getByLabelText('Inside'), 'kept');
    const button = screen.getByRole('button', { name: 'Their life' });
    await userEvent.click(button);
    await userEvent.click(button);
    expect(screen.getByLabelText('Inside')).toHaveValue('kept');
  });

  it('shows a hidden-text check only when done', () => {
    const { unmount } = render(<Harness />);
    expect(screen.queryByText(copy.done)).toBeNull();
    unmount();
    render(<Harness done />);
    expect(screen.getByText(copy.done)).toHaveClass('sr-only');
  });
});
