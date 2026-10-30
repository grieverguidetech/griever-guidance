import { render, screen } from '@testing-library/react';
import { DateField, DateInput } from './DateField';

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
    expect(screen.getByLabelText('Date')).toHaveAttribute('aria-describedby', 'd-help d-note');
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('shows the format help as visible text when asked', () => {
    render(<DateField id="d" label="Date" value="" visibleHelp onChange={() => undefined} />);
    expect(screen.getByText(/Type a date such as/)).not.toHaveClass('sr-only');
  });
});
