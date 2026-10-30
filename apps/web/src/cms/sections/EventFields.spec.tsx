import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { findHardCodedCopy } from '@griever/copy';
import { EventFields } from './EventFields';

const keys = { date: 'receptionDate', time: 'receptionTime', place: 'receptionPlace' } as const;

function setup(props: { values?: Record<string, string>; placeLabel?: string; extra?: React.ReactNode } = {}) {
  const onChange = vi.fn();
  render(
    <EventFields legend="Reception" keys={keys} values={props.values ?? {}} onChange={onChange} placeLabel={props.placeLabel} extra={props.extra} />,
  );
  return { onChange };
}

describe('EventFields', () => {
  it('is a group named by its legend, holding date, time and place', () => {
    setup();
    const group = screen.getByRole('group', { name: 'Reception' });
    expect(within(group).getByLabelText('Date')).toBeInTheDocument();
    expect(within(group).getByLabelText('Time')).toBeInTheDocument();
    expect(within(group).getByLabelText('Place')).toBeInTheDocument();
  });

  it('uses a custom place label', () => {
    setup({ placeLabel: 'Cemetery' });
    expect(screen.getByLabelText('Cemetery')).toBeInTheDocument();
    expect(screen.queryByLabelText('Place')).toBeNull();
  });

  it('shows the values it is given', () => {
    setup({ values: { receptionDate: 'May 29, 2026', receptionTime: '2:00 PM', receptionPlace: 'Hall' } });
    expect(screen.getByLabelText('Date')).toHaveValue('May 29, 2026');
    expect(screen.getByLabelText('Time')).toHaveValue('14:00');
    expect(screen.getByLabelText('Place')).toHaveValue('Hall');
  });

  it('each change sends only its one key', async () => {
    const { onChange } = setup();
    await userEvent.type(screen.getByLabelText('Place'), 'H');
    expect(onChange).toHaveBeenLastCalledWith({ receptionPlace: 'H' });
    await userEvent.type(screen.getByLabelText('Date'), '5');
    expect(onChange).toHaveBeenLastCalledWith({ receptionDate: '5' });
    onChange.mockClear();
    const time = screen.getByLabelText('Time');
    time.focus();
    await userEvent.keyboard('0230PM');
    expect(onChange).toHaveBeenCalled();
    for (const call of onChange.mock.calls) {
      expect(Object.keys(call[0])).toEqual(['receptionTime']);
    }
  });

  it('tabs through date, time, place, then the extra slot', async () => {
    setup({ extra: <input aria-label="Extra" /> });
    await userEvent.tab();
    expect(screen.getByLabelText('Date')).toHaveFocus();
    await userEvent.tab();
    expect(screen.getByRole('button', { name: 'Choose date from calendar' })).toHaveFocus();
    await userEvent.tab();
    expect(screen.getByLabelText('Time')).toHaveFocus();
    await userEvent.tab();
    expect(screen.getByLabelText('Place')).toHaveFocus();
    await userEvent.tab();
    expect(screen.getByLabelText('Extra')).toHaveFocus();
  });

  it('has no delete or remove control (C9)', () => {
    setup();
    expect(screen.queryByRole('button', { name: /delete|remove/i })).toBeNull();
  });

  it('holds no hard-coded copy', () => {
    const source = readFileSync(join(import.meta.dirname, 'EventFields.tsx'), 'utf8');
    expect(findHardCodedCopy(source, 'cmsService')).toEqual([]);
  });
});
