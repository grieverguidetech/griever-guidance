import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { useState } from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { findHardCodedCopy } from '@griever/copy';
import { ServiceSection, type ServicePatch } from './ServiceSection';

type Values = Parameters<typeof ServiceSection>[0]['values'];

/** Keeps the values in state, like the editor does, and records each patch. */
function setup(initial: Values = {}) {
  const patches: ServicePatch[] = [];
  const onReadyChange = vi.fn();
  function Harness() {
    const [values, setValues] = useState<Values>(initial);
    return (
      <ServiceSection
        values={values}
        onChange={(patch) => {
          patches.push(patch);
          setValues((v) => ({ ...v, ...patch }));
        }}
        onReadyChange={onReadyChange}
      />
    );
  }
  render(<Harness />);
  return { patches, onReadyChange };
}

const message = () => screen.getByLabelText('Message') as HTMLTextAreaElement;

describe('ServiceSection', () => {
  it('has four groups in order, each named by its legend, and no h1', () => {
    setup();
    const names = screen.getAllByRole('group').map((g) => g.querySelector('legend')?.textContent);
    expect(names).toEqual([
      'Visitation or calling hours',
      'Funeral or memorial service',
      'Burial or interment',
      'Reception',
    ]);
    expect(screen.queryByRole('heading', { level: 1 })).toBeNull();
  });

  it('each group writes its own fields', async () => {
    const { patches } = setup();
    await userEvent.type(screen.getByRole('textbox', { name: 'Visitation or calling hours Place' }), 'H');
    expect(patches.at(-1)).toEqual({ visitationPlace: 'H' });
    await userEvent.type(screen.getByRole('textbox', { name: 'Funeral or memorial service Place' }), 'C');
    expect(patches.at(-1)).toEqual({ servicePlace: 'C' });
    await userEvent.type(screen.getByRole('textbox', { name: 'Burial or interment Cemetery' }), 'R');
    expect(patches.at(-1)).toEqual({ burialPlace: 'R' });
    await userEvent.type(screen.getByRole('textbox', { name: 'Reception Place' }), 'P');
    expect(patches.at(-1)).toEqual({ receptionPlace: 'P' });
  });

  it('the funeral group also writes type, address and officiant', async () => {
    const { patches } = setup();
    await userEvent.type(screen.getByLabelText('Type of service'), 'F');
    expect(patches.at(-1)).toEqual({ serviceType: 'F' });
    await userEvent.type(screen.getByLabelText('Address'), 'A');
    expect(patches.at(-1)).toEqual({ serviceAddress: 'A' });
    await userEvent.type(screen.getByLabelText('Officiant'), 'O');
    expect(patches.at(-1)).toEqual({ serviceOfficiant: 'O' });
  });

  it('only the main service date writes serviceDate', async () => {
    const { patches } = setup();
    await userEvent.type(screen.getByRole('textbox', { name: 'Visitation or calling hours Date' }), '1');
    await userEvent.type(screen.getByRole('textbox', { name: 'Burial or interment Date' }), '2');
    await userEvent.type(screen.getByRole('textbox', { name: 'Reception Date' }), '3');
    expect(patches.some((p) => 'serviceDate' in p)).toBe(false);
    await userEvent.type(screen.getByRole('textbox', { name: 'Funeral or memorial service Date' }), '4');
    expect(patches.at(-1)).toEqual({ serviceDate: '4' });
  });

  it('Private family hides the burial fields and the message says so', async () => {
    const { patches } = setup({ personName: 'Margaret Hayes', burialPlace: 'Rest Haven' });
    const box = screen.getByRole('checkbox', { name: 'Private burial, family only' });
    await userEvent.click(box);
    expect(patches.at(-1)).toEqual({ burialPrivate: true });
    expect(screen.queryByRole('group', { name: 'Burial or interment' })).toBeNull();
    expect(screen.queryByLabelText('Cemetery')).toBeNull();
    expect(box).toHaveFocus();
    expect(message().value).toContain('The burial will be private.');
    await userEvent.click(box);
    expect(screen.getByRole('group', { name: 'Burial or interment' })).toBeInTheDocument();
  });

  it('the message follows the details until it is edited', async () => {
    setup({ personName: 'Margaret Hayes' });
    expect(message().value).not.toContain('Hall');
    await userEvent.type(screen.getByRole('textbox', { name: 'Reception Place' }), 'Hall');
    expect(message().value).toContain('A reception will be held at Hall.');
    expect(screen.queryByRole('button', { name: 'Use the details above' })).toBeNull();
  });

  it('after an edit the message stays as typed, and reset brings back the prefill', async () => {
    const { patches } = setup({ personName: 'Margaret Hayes' });
    await userEvent.type(message(), 'X');
    expect(patches.at(-1)?.serviceMessage).toMatch(/X$/);
    const typed = message().value;
    await userEvent.type(screen.getByRole('textbox', { name: 'Reception Place' }), 'Hall');
    expect(message().value).toBe(typed);
    await userEvent.click(screen.getByRole('button', { name: 'Use the details above' }));
    expect(patches.at(-1)).toEqual({ serviceMessage: undefined });
    expect(message().value).toContain('A reception will be held at Hall.');
    expect(screen.queryByRole('button', { name: 'Use the details above' })).toBeNull();
  });

  it('notes write serviceNotes', async () => {
    const { patches } = setup();
    await userEvent.type(screen.getByLabelText('Notes'), 'N');
    expect(patches.at(-1)).toEqual({ serviceNotes: 'N' });
  });

  it('mark as ready follows sectionStatus.service and reports changes', async () => {
    const { onReadyChange } = setup({ sectionStatus: { service: 'ready' } });
    const button = screen.getByRole('button', { name: 'Mark as ready' });
    expect(button).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(button);
    expect(onReadyChange).toHaveBeenCalledWith(false);
  });

  it('has no sms: link and no send, delete or remove control (C1, C9)', () => {
    setup({ personName: 'Margaret Hayes', serviceMessage: 'Hello' });
    expect(document.querySelector('a[href^="sms:"]')).toBeNull();
    expect(screen.queryByRole('link', { name: /messages/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /send|share|delete|remove/i })).toBeNull();
  });

  it('every group is a labelled fieldset', () => {
    setup();
    const group = screen.getByRole('group', { name: 'Reception' });
    expect(within(group).getByLabelText('Reception Date')).toBeInTheDocument();
  });

  it('holds no hard-coded copy', () => {
    const source = readFileSync(join(import.meta.dirname, 'ServiceSection.tsx'), 'utf8');
    expect(findHardCodedCopy(source, 'cmsService')).toEqual([]);
  });
});
