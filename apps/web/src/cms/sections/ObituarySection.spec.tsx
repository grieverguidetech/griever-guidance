import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { findHardCodedCopy } from '@griever/copy';
import { ObituarySection, type ObituaryPatch } from './ObituarySection';
import { resetSessionDismissed } from './PhoneNudge';

type Values = Parameters<typeof ObituarySection>[0]['values'];

function setup(initial: Values = {}) {
  const patches: ObituaryPatch[] = [];
  const onReadyChange = vi.fn();
  const onOpenPerson = vi.fn();
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
        onOpenPerson={onOpenPerson}
      />
    );
  }
  render(<Harness />);
  return { patches, onReadyChange, onOpenPerson };
}

const text = () => screen.getByLabelText('Obituary') as HTMLTextAreaElement;
const person = { personName: 'Ann Lee', dateOfPassing: 'June 1, 2026', birthDate: 'May 2, 1940' };

describe('ObituarySection', () => {
  it('shows the name and dates read-only, with a button to change them in The person', async () => {
    const { onOpenPerson } = setup(person);
    expect(screen.getByText('Ann Lee')).toBeInTheDocument();
    expect(screen.getByText('May 2, 1940')).toBeInTheDocument();
    expect(screen.getByText('June 1, 2026')).toBeInTheDocument();
    expect(screen.getByText('Details from The person')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Change these on The person' }));
    expect(onOpenPerson).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('textbox', { name: 'Name' })).toBeNull();
  });

  it('starts the text from the template, with brackets for what is missing, and follows new details until edited', async () => {
    setup(person);
    expect(text().value).toContain('Ann Lee, 86, of [CITY], [STATE], passed away on June 1, 2026.');
    expect(text().value).toContain('Ann Lee was born in [BIRTH PLACE] to [MOTHER\'S NAME] and [FATHER\'S NAME] on May 2, 1940.');
    await userEvent.type(screen.getByLabelText(/City where they lived/), 'Tulsa');
    expect(text().value).toContain('Ann Lee, 86, of Tulsa, [STATE]');
    await userEvent.type(screen.getByLabelText(/Their work/), 'a teacher');
    expect(text().value).toContain('[He/She] worked as a teacher.');
    await userEvent.type(screen.getByLabelText(/Survived by/), 'her sons');
    expect(text().value).toContain('Ann Lee is survived by her sons.');
    await userEvent.type(screen.getByLabelText(/A personal note/), 'She loved gardens.');
    expect(text().value).toMatch(/She loved gardens\.$/);
  });

  it('fills the service and visitation parts from the Service fields', () => {
    setup({
      ...person,
      servicePlace: 'Oak Chapel',
      serviceDate: 'June 5, 2026',
      serviceTime: '2:00 PM',
      serviceOfficiant: 'Reverend Sam Cole',
      burialPlace: 'Oak Hill',
      visitationPlace: 'Oak Chapel',
      visitationDate: 'June 4, 2026',
      visitationTime: '6:00 PM',
    });
    expect(text().value).toContain(
      'Funeral service will be held at Oak Chapel on June 5, 2026 at 2:00 PM with Reverend Sam Cole officiating. Burial will follow at Oak Hill, [CEMETERY LOCATION]. Visitation will be held at Oak Chapel on June 4, 2026 at 6:00 PM.',
    );
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
    expect(text().value).toContain('Ann Lee, 86, of Tulsa, [STATE]');
    expect(text()).toHaveFocus();
    expect(screen.queryByRole('button', { name: 'Use the details above' })).toBeNull();
  });

  it('shows one calm line while [brackets] remain, as part of the text description, and hides it when none remain', async () => {
    setup(person);
    const line = 'Parts in [brackets] are still to fill in. Type over them, or delete what you don\'t need.';
    expect(screen.getByText(line)).toBeInTheDocument();
    expect(text()).toHaveAccessibleDescription(expect.stringContaining(line));
    expect(screen.queryByRole('status')).toBeNull();
    await userEvent.clear(text());
    await userEvent.type(text(), 'Ann Lee loved gardens [[my note].');
    expect(screen.queryByText(line)).toBeNull();
    expect(text()).not.toHaveAccessibleDescription(expect.stringContaining('Parts in'));
  });

  it('has no where-it-is-published inputs', () => {
    setup();
    expect(screen.queryByLabelText(/Link to the obituary/)).toBeNull();
    expect(screen.queryByLabelText(/Where it is published/)).toBeNull();
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

describe('ObituarySection phone nudge', () => {
  afterEach(() => {
    resetSessionDismissed();
    window.localStorage.clear();
  });

  function renderReadyToggle() {
    function Ready() {
      const [ready, setReady] = useState(false);
      return (
        <ObituarySection
          values={{ sectionStatus: { obituary: ready ? 'ready' : 'in_progress' } }}
          onChange={() => undefined}
          onReadyChange={setReady}
        />
      );
    }
    render(<Ready />);
  }

  it('shows its own line once marked ready and hides it when un-marked', async () => {
    renderReadyToggle();
    expect(screen.queryByRole('region', { name: 'The obituary is ready.' })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Mark as ready' }));
    expect(screen.getByRole('region', { name: 'The obituary is ready.' })).toHaveTextContent('begin sharing it with your loved ones');
    await userEvent.click(screen.getByRole('button', { name: 'Mark as ready' }));
    expect(screen.queryByRole('region', { name: 'The obituary is ready.' })).toBeNull();
  });
});
