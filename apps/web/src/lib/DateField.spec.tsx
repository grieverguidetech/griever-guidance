import { useState } from 'react';
import userEvent from '@testing-library/user-event';
import { render, screen } from '@testing-library/react';
import { DateField, DateInput, dateToISO } from './DateField';

describe('DateInput notes', () => {
  it('renders the same as before when no note or visible help is asked for', () => {
    const { container } = render(<DateInput id="d" value="" onChange={() => undefined} />);
    expect(container.children).toHaveLength(1);
    expect(screen.getByRole('textbox')).toHaveAttribute('aria-describedby', 'd-help');
    expect(screen.getByText(/Type a date such as/)).toHaveClass('sr-only');
    expect(screen.queryByText('A note')).toBeNull();
  });

  it('adds a note that describes the input and is not an alert', () => {
    render(<DateField id="d" label="Date" value="x" note="A note" onChange={() => undefined} />);
    const note = screen.getByText('A note');
    expect(note).toHaveAttribute('id', 'd-note');
    expect(screen.getByLabelText('Date', { selector: 'input' })).toHaveAttribute('aria-describedby', 'd-help d-note');
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('keeps the visible help screen-reader-only until the field has focus', async () => {
    render(<DateField id="d" label="Date" value="" visibleHelp onChange={() => undefined} />);
    const help = screen.getByText(/Type a date such as/);
    const input = screen.getByLabelText('Date', { selector: 'input' });
    expect(help).toHaveClass('sr-only');
    expect(input).toHaveAttribute('aria-describedby', 'd-help');
    await userEvent.click(input);
    expect(help).toHaveClass('gg-hint');
    expect(help).not.toHaveClass('sr-only');
    expect(input).toHaveAttribute('aria-describedby', 'd-help');
  });

  it('keeps the help visible when focus moves to the calendar button, and hides it on leaving', async () => {
    render(<DateField id="d" label="Date" value="" visibleHelp onChange={() => undefined} />);
    const help = screen.getByText(/Type a date such as/);
    await userEvent.click(screen.getByLabelText('Date', { selector: 'input' }));
    await userEvent.tab();
    expect(screen.getByRole('button', { name: 'Date Choose date from calendar' })).toHaveFocus();
    expect(help).not.toHaveClass('sr-only');
    await userEvent.tab();
    expect(help).toHaveClass('sr-only');
  });

  it('shows the help while a note is showing, even without focus', () => {
    render(<DateField id="d" label="Date" value="x" visibleHelp note="A note" onChange={() => undefined} />);
    expect(screen.getByText(/Type a date such as/)).not.toHaveClass('sr-only');
  });
});

describe('calendar button name', () => {
  it('names each calendar button by its own field, so two on a page differ', () => {
    render(
      <>
        <DateField id="a" label="Date of birth" value="" onChange={() => undefined} />
        <DateField id="b" label="Date of passing" value="" onChange={() => undefined} />
      </>,
    );
    expect(screen.getByRole('button', { name: 'Date of birth Choose date from calendar' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Date of passing Choose date from calendar' })).toBeInTheDocument();
  });

  it('uses labelledBy (for example a legend plus label) when there is no labelId', () => {
    render(
      <>
        <span id="lg">Funeral or memorial service</span>
        <span id="lb">Date</span>
        <DateInput id="x" labelledBy="lg lb" value="" onChange={() => undefined} />
      </>,
    );
    expect(
      screen.getByRole('button', { name: 'Funeral or memorial service Date Choose date from calendar' }),
    ).toBeInTheDocument();
  });
});

describe('DateInput noteOnBlur', () => {
  function Harness() {
    const [value, setValue] = useState('');
    return <DateField id="d" label="Date" value={value} noteOnBlur="Blur note" onChange={setValue} />;
  }

  it('stays hidden while typing, shows after blur, and hides again when the text changes', async () => {
    render(<Harness />);
    const input = screen.getByLabelText('Date', { selector: 'input' });
    await userEvent.type(input, 'Ma');
    expect(screen.queryByText('Blur note')).toBeNull();
    await userEvent.tab();
    expect(screen.getByText('Blur note')).toBeInTheDocument();
    expect(input.getAttribute('aria-describedby')).toContain('d-note');
    await userEvent.type(input, 'y');
    expect(screen.queryByText('Blur note')).toBeNull();
  });

  it('shows nothing after blur from an empty field', async () => {
    render(<Harness />);
    await userEvent.click(screen.getByLabelText('Date', { selector: 'input' }));
    await userEvent.tab();
    expect(screen.queryByText('Blur note')).toBeNull();
  });
});

describe('DateInput blur normalization', () => {
  function Harness({ start }: { start: string }) {
    const [value, setValue] = useState(start);
    return <DateField id="d" label="Date" value={value} onChange={setValue} />;
  }

  async function blurWith(text: string) {
    render(<Harness start="" />);
    const input = screen.getByLabelText('Date', { selector: 'input' });
    await userEvent.click(input);
    await userEvent.type(input, text);
    await userEvent.tab();
    return input;
  }

  it.each(['Oct 28', '5/29', '2026'])('leaves incomplete "%s" exactly as typed', async (text) => {
    expect(await blurWith(text)).toHaveValue(text);
  });

  it.each([
    ['October 28, 2026', 'October 28, 2026'],
    ['10/28/2026', 'October 28, 2026'],
    ['2026-10-28', 'October 28, 2026'],
  ])('tidies complete "%s" to "%s"', async (text, expected) => {
    expect(await blurWith(text)).toHaveValue(expected);
  });
});

describe('dateToISO', () => {
  it('returns an ISO date only for a complete date', () => {
    expect(dateToISO('October 28, 2026')).toBe('2026-10-28');
    expect(dateToISO('10/28/2026')).toBe('2026-10-28');
    expect(dateToISO('2026-10-28')).toBe('2026-10-28');
    expect(dateToISO('Oct 28')).toBe('');
    expect(dateToISO('5/29')).toBe('');
    expect(dateToISO('2026')).toBe('');
  });
});

describe('calendar button fallback', () => {
  it('uses the plain button text when no label id is given', () => {
    render(<DateInput id="solo" value="" onChange={() => undefined} />);
    expect(screen.getByRole('button', { name: 'Choose date from calendar' })).toBeInTheDocument();
  });
});
