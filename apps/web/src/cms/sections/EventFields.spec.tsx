import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ReactNode } from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { findHardCodedCopy } from '@griever/copy';
import { EventFields, type Suggestion } from './EventFields';

const keys = { date: 'receptionDate', time: 'receptionTime', place: 'receptionPlace' } as const;

type Slot = ReactNode | ((legendId: string) => ReactNode);

function setup(
  props: { values?: Record<string, string>; placeLabel?: string; extra?: Slot; lead?: Slot; hideFields?: boolean; dateSuggestion?: Suggestion; placeSuggestion?: Suggestion } = {},
) {
  const onChange = vi.fn();
  render(
    <EventFields legend="Reception" keys={keys} values={props.values ?? {}} onChange={onChange} placeLabel={props.placeLabel} extra={props.extra} lead={props.lead} hideFields={props.hideFields} dateSuggestion={props.dateSuggestion} placeSuggestion={props.placeSuggestion} />,
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

  it('names each field with the legend and its label', () => {
    setup({ placeLabel: 'Cemetery' });
    expect(screen.getByRole('textbox', { name: 'Reception Date' })).toBeInTheDocument();
    expect(screen.getByLabelText('Reception Time')).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Reception Cemetery' })).toBeInTheDocument();
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

  it('lead comes right after the legend, before date', async () => {
    setup({ lead: <input aria-label="Lead" /> });
    await userEvent.tab();
    expect(screen.getByLabelText('Lead')).toHaveFocus();
    await userEvent.tab();
    expect(screen.getByLabelText('Date')).toHaveFocus();
  });

  it('hideFields hides date, time and place but keeps the group, lead and extra', () => {
    setup({ hideFields: true, lead: <input aria-label="Lead" />, extra: <input aria-label="Extra" /> });
    expect(screen.getByRole('group', { name: 'Reception' })).toBeInTheDocument();
    expect(screen.queryByLabelText('Date')).toBeNull();
    expect(screen.queryByLabelText('Time')).toBeNull();
    expect(screen.queryByLabelText('Place')).toBeNull();
    expect(screen.getByLabelText('Lead')).toBeInTheDocument();
    expect(screen.getByLabelText('Extra')).toBeInTheDocument();
  });

  it('slots given as functions get the legend id, so they can be named with the legend', () => {
    setup({
      extra: (legendId) => (
        <>
          <span id="x-label">Address</span>
          <input aria-labelledby={`${legendId} x-label`} />
        </>
      ),
    });
    expect(screen.getByRole('textbox', { name: 'Reception Address' })).toBeInTheDocument();
  });

  it('shows suggestion buttons only while the field is empty, named with the legend', async () => {
    const onUse = vi.fn();
    setup({ dateSuggestion: { label: 'Same day', onUse }, placeSuggestion: { label: 'Same place', onUse } });
    const day = screen.getByRole('button', { name: 'Reception Same day' });
    expect(day).toHaveClass('min-h-[44px]');
    await userEvent.click(day);
    expect(onUse).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText('Date')).toHaveFocus();
    expect(screen.getByRole('button', { name: 'Reception Same place' })).toBeInTheDocument();
  });

  it('shows no suggestion without one, or once the field has a value', () => {
    const s = { label: 'Same day', onUse: vi.fn() };
    setup({ values: { receptionDate: 'May 29, 2026', receptionPlace: 'Hall' }, dateSuggestion: s, placeSuggestion: s });
    expect(screen.queryByRole('button', { name: /Same day/ })).toBeNull();
  });

  it('never fills by itself', () => {
    const onUse = vi.fn();
    const { onChange } = setup({ dateSuggestion: { label: 'Same day', onUse } });
    expect(onUse).not.toHaveBeenCalled();
    expect(onChange).not.toHaveBeenCalled();
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
