import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { findHardCodedCopy } from '@griever/copy';
import { PersonSection } from './PersonSection';

function setup(values = {}) {
  const onChange = vi.fn();
  const onReadyChange = vi.fn();
  render(<PersonSection values={values} onChange={onChange} onReadyChange={onReadyChange} />);
  return { onChange, onReadyChange };
}

describe('PersonSection', () => {
  it('shows each field with a visible label and no heading or save button', () => {
    setup({ personName: 'Margaret Hayes' });
    expect(screen.getByLabelText('Their name')).toHaveValue('Margaret Hayes');
    expect(screen.getByLabelText(/Date of birth/, { selector: 'input' })).toBeInTheDocument();
    expect(screen.getByLabelText(/Date they passed/, { selector: 'input' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { level: 1 })).toBeNull();
    expect(screen.queryByRole('button', { name: /save/i })).toBeNull();
  });

  it('says nothing about a normal date', () => {
    setup({ birthDate: 'March 3, 1950', dateOfPassing: 'May 29, 2026' });
    expect(screen.queryByText(/couldn't read/)).toBeNull();
    expect(screen.queryByText(/after the date they passed/)).toBeNull();
    expect(screen.queryByText(/still ahead/)).toBeNull();
  });

  it('adds a quiet note, linked to the input and not an alert, for an unreadable birth date after blur', async () => {
    setup({ birthDate: 'long ago' });
    const input = screen.getByLabelText(/Date of birth/, { selector: 'input' });
    expect(screen.queryByText(/couldn't read/)).toBeNull();
    await userEvent.click(input);
    await userEvent.tab();
    const note = screen.getByText("We couldn't read this as a date. It will show as typed.");
    expect(screen.queryByRole('alert')).toBeNull();
    expect(input.getAttribute('aria-describedby')).toContain(note.id);
  });

  it('notes a birth date after the date they passed', () => {
    setup({ birthDate: 'June 1, 2026', dateOfPassing: 'May 29, 2026' });
    expect(screen.getByText('This is after the date they passed. You can keep it.')).toBeInTheDocument();
  });

  it('notes a date they passed that is still ahead, and still saves what is typed', async () => {
    const { onChange } = setup({ dateOfPassing: 'December 25, 2099' });
    expect(screen.getByText('This date is still ahead. You can keep it.')).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText(/Date they passed/, { selector: 'input' }), '1');
    expect(onChange).toHaveBeenCalledWith({ dateOfPassing: 'December 25, 20991' });
  });

  it('shows the date format help only while a date field has focus, and always describes it', async () => {
    setup();
    const helps = screen.getAllByText('Type a date such as May 29, 2026, or use the calendar button.');
    const birth = screen.getByLabelText(/Date of birth/, { selector: 'input' });
    expect(helps[0]).toHaveClass('sr-only');
    expect(birth.getAttribute('aria-describedby')).toContain(helps[0].id);
    await userEvent.click(birth);
    expect(helps[0]).not.toHaveClass('sr-only');
    expect(helps[1]).toHaveClass('sr-only');
  });

  it('puts the two dates in a grid: one column on a phone, two from sm up', () => {
    setup();
    const grid = screen.getByLabelText(/Date of birth/, { selector: 'input' }).closest('.grid');
    expect(grid).toHaveClass('grid-cols-1', 'sm:grid-cols-2');
    expect(grid).toContainElement(screen.getByLabelText(/Date they passed/, { selector: 'input' }));
    expect(grid).not.toContainElement(screen.getByLabelText('Their name'));
  });

  it('shows the intro at the top', () => {
    setup();
    expect(screen.getByText('Start with their name. The rest can wait.')).toBeInTheDocument();
  });

  it('shows Next only when ready, and calls onNext', async () => {
    const onNext = vi.fn();
    const { rerender } = render(
      <PersonSection values={{}} onChange={vi.fn()} onReadyChange={vi.fn()} nextSection="service" onNext={onNext} />,
    );
    expect(screen.queryByRole('button', { name: 'Next: Service' })).toBeNull();
    rerender(
      <PersonSection
        values={{ sectionStatus: { person: 'ready' } }}
        onChange={vi.fn()}
        onReadyChange={vi.fn()}
        nextSection="service"
        onNext={onNext}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Next: Service' }));
    expect(onNext).toHaveBeenCalledTimes(1);
  });

  it('typing calls onChange with only the name', async () => {
    const { onChange } = setup();
    await userEvent.type(screen.getByLabelText('Their name'), 'M');
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith({ personName: 'M' });
  });

  it('dates go through DateField and send only their own field', async () => {
    const { onChange } = setup();
    await userEvent.type(screen.getByLabelText(/Date of birth/, { selector: 'input' }), '5');
    expect(onChange).toHaveBeenLastCalledWith({ birthDate: '5' });
    await userEvent.type(screen.getByLabelText(/Date they passed/, { selector: 'input' }), '6');
    expect(onChange).toHaveBeenLastCalledWith({ dateOfPassing: '6' });
  });

  it.each([
    ['3/3/1900', 'March 3, 1900'],
    ['3/3/1925', 'March 3, 1925'],
    ['3/3/1940', 'March 3, 1940'],
    ['3/3/1999', 'March 3, 1999'],
    ['3/3/2000', 'March 3, 2000'],
  ])('tidies a birth date typed as %s on blur', async (typed, tidy) => {
    const { onChange } = setup({ birthDate: typed });
    await userEvent.click(screen.getByLabelText(/Date of birth/, { selector: 'input' }));
    await userEvent.tab();
    expect(onChange).toHaveBeenLastCalledWith({ birthDate: tidy });
  });

  it('tidies a date they passed before 2000 on blur', async () => {
    const { onChange } = setup({ dateOfPassing: '5/29/1985' });
    await userEvent.click(screen.getByLabelText(/Date they passed/, { selector: 'input' }));
    await userEvent.tab();
    expect(onChange).toHaveBeenLastCalledWith({ dateOfPassing: 'May 29, 1985' });
  });

  it('does not tidy a birth date before 1800', async () => {
    const { onChange } = setup({ birthDate: '3/3/1750' });
    await userEvent.click(screen.getByLabelText(/Date of birth/, { selector: 'input' }));
    await userEvent.tab();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('tidies a typed date on blur', async () => {
    const { onChange } = setup({ dateOfPassing: '5/29/2020' });
    const field = screen.getByLabelText(/Date they passed/, { selector: 'input' });
    await userEvent.click(field);
    await userEvent.tab();
    expect(onChange).toHaveBeenLastCalledWith({ dateOfPassing: 'May 29, 2020' });
  });

  it('mark as ready follows sectionStatus.person and reports changes', async () => {
    const { onReadyChange } = setup({ sectionStatus: { person: 'ready' } });
    const button = screen.getByRole('button', { name: 'Mark as ready' });
    expect(button).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(button);
    expect(onReadyChange).toHaveBeenCalledWith(false);
  });

  it('shows no phone nudge after Mark as ready', async () => {
    function Harness() {
      const [ready, setReady] = useState(false);
      return (
        <PersonSection
          values={{ sectionStatus: { person: ready ? 'ready' : 'in_progress' } }}
          onChange={vi.fn()}
          onReadyChange={setReady}
        />
      );
    }
    render(<Harness />);
    await userEvent.click(screen.getByRole('button', { name: 'Mark as ready' }));
    expect(screen.getByRole('button', { name: 'Mark as ready' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.queryByRole('status')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Got it' })).toBeNull();
  });

  it('is not ready when the section is in progress or missing', () => {
    setup({ sectionStatus: { person: 'in_progress' } });
    expect(screen.getByRole('button', { name: 'Mark as ready' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('has no delete or remove control (C9)', () => {
    setup({ personName: 'Margaret Hayes' });
    expect(screen.queryByRole('button', { name: /delete|remove/i })).toBeNull();
  });

  it('reaches every control by keyboard', async () => {
    setup();
    await userEvent.tab();
    expect(screen.getByLabelText('Their name')).toHaveFocus();
    await userEvent.tab();
    expect(screen.getByLabelText(/Date of birth/, { selector: 'input' })).toHaveFocus();
    await userEvent.tab();
    expect(screen.getByRole('button', { name: /^Date of birth.*, choose date from calendar$/ })).toHaveFocus();
    await userEvent.tab();
    expect(screen.getByLabelText(/Date they passed/, { selector: 'input' })).toHaveFocus();
    await userEvent.tab();
    expect(screen.getByRole('button', { name: /^Date they passed.*, choose date from calendar$/ })).toHaveFocus();
    await userEvent.tab();
    expect(screen.getByRole('button', { name: 'Mark as ready' })).toHaveFocus();
  });

  it('holds no hard-coded copy', () => {
    const source = readFileSync(join(import.meta.dirname, 'PersonSection.tsx'), 'utf8');
    expect(findHardCodedCopy(source, 'cmsPerson')).toEqual([]);
  });
});
