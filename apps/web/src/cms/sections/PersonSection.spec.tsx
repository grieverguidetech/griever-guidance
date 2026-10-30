import { readFileSync } from 'node:fs';
import { join } from 'node:path';
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
    expect(screen.getByLabelText(/Date of birth/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Date they passed/)).toBeInTheDocument();
    expect(screen.queryByRole('heading', { level: 1 })).toBeNull();
    expect(screen.queryByRole('button', { name: /save/i })).toBeNull();
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
    await userEvent.type(screen.getByLabelText(/Date of birth/), '5');
    expect(onChange).toHaveBeenLastCalledWith({ birthDate: '5' });
    await userEvent.type(screen.getByLabelText(/Date they passed/), '6');
    expect(onChange).toHaveBeenLastCalledWith({ dateOfPassing: '6' });
  });

  it('tidies a typed date on blur', async () => {
    const { onChange } = setup({ dateOfPassing: '5/29/2020' });
    const field = screen.getByLabelText(/Date they passed/);
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
    expect(screen.getByLabelText(/Date of birth/)).toHaveFocus();
    await userEvent.tab();
    expect(screen.getAllByRole('button', { name: 'Choose date from calendar' })[0]).toHaveFocus();
    await userEvent.tab();
    expect(screen.getByLabelText(/Date they passed/)).toHaveFocus();
    await userEvent.tab();
    expect(screen.getAllByRole('button', { name: 'Choose date from calendar' })[1]).toHaveFocus();
    await userEvent.tab();
    expect(screen.getByRole('button', { name: 'Mark as ready' })).toHaveFocus();
  });

  it('holds no hard-coded copy', () => {
    const source = readFileSync(join(import.meta.dirname, 'PersonSection.tsx'), 'utf8');
    expect(findHardCodedCopy(source, 'cmsPerson')).toEqual([]);
  });
});
