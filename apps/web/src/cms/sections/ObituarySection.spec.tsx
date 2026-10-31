import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { findHardCodedCopy } from '@griever/copy';
import { ObituarySection, type ObituaryPatch } from './ObituarySection';

type Values = Parameters<typeof ObituarySection>[0]['values'];

function setup(initial: Values = {}) {
  const patches: ObituaryPatch[] = [];
  const onReadyChange = vi.fn();
  function Harness() {
    const [values, setValues] = useState<Values>(initial);
    return (
      <ObituarySection
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

const text = () => screen.getByLabelText('Obituary') as HTMLTextAreaElement;
const person = { personName: 'Ann Lee', dateOfPassing: 'June 1, 2026', birthDate: 'May 2, 1940' };

describe('ObituarySection', () => {
  it('shows the name and dates read-only, with a hint to change them in The person', () => {
    setup(person);
    expect(screen.getByText('Ann Lee')).toBeInTheDocument();
    expect(screen.getByText('May 2, 1940')).toBeInTheDocument();
    expect(screen.getByText('June 1, 2026')).toBeInTheDocument();
    expect(screen.getByText('To change these, go to The person.')).toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: 'Name' })).toBeNull();
  });

  it('starts the text from the template and follows new details until edited', async () => {
    setup(person);
    expect(text().value).toContain('Ann Lee died on June 1, 2026.');
    await userEvent.type(screen.getByLabelText(/City where they lived/), 'Tulsa');
    expect(text().value).toContain('Ann Lee lived in Tulsa.');
    await userEvent.type(screen.getByLabelText(/Their work/), 'teacher');
    expect(text().value).toContain('Their work: teacher.');
    await userEvent.type(screen.getByLabelText(/Survived by/), 'her sons');
    expect(text().value).toContain('Survived by her sons.');
    await userEvent.type(screen.getByLabelText(/A personal note/), 'She loved gardens.');
    expect(text().value).toContain('She loved gardens.');
  });

  it('keeps an edit, shows the edited hint, and resets with focus on the text', async () => {
    const { patches } = setup(person);
    await userEvent.type(text(), '!');
    expect(patches.at(-1)).toHaveProperty('obituaryText');
    expect(screen.getByText(/You changed the obituary/)).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText(/City where they lived/), 'Tulsa');
    expect(text().value).not.toContain('Tulsa');
    await userEvent.click(screen.getByRole('button', { name: 'Use the details above' }));
    expect(patches.at(-1)).toEqual({ obituaryText: undefined });
    expect(text().value).toContain('Ann Lee lived in Tulsa.');
    expect(text()).toHaveFocus();
    expect(screen.queryByRole('button', { name: 'Use the details above' })).toBeNull();
  });

  it('saves where it is published', async () => {
    const { patches } = setup();
    await userEvent.type(screen.getByLabelText(/Link to the obituary/), 'a');
    await userEvent.type(screen.getByLabelText(/Where it is published \(optional\)/), 'b');
    expect(patches).toEqual([{ obituaryUrl: 'a' }, { obituaryPublisher: 'b' }]);
  });

  it('marks ready through MarkReady', async () => {
    const { onReadyChange } = setup();
    await userEvent.click(screen.getByRole('button', { name: /ready/i }));
    expect(onReadyChange).toHaveBeenCalledWith(true);
  });

  it('has no heading level 1, no delete and no send', () => {
    setup(person);
    expect(screen.queryByRole('heading', { level: 1 })).toBeNull();
    expect(screen.queryByRole('button', { name: /delete|remove|send|share/i })).toBeNull();
  });

  it('holds no hard-coded copy', () => {
    const source = readFileSync(join(import.meta.dirname, 'ObituarySection.tsx'), 'utf8');
    expect(findHardCodedCopy(source, 'cmsObituary')).toEqual([]);
  });
});
