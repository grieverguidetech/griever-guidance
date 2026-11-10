import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FLOW_DETAIL_MAX_LENGTH } from '@griever/shared';
import { findHardCodedCopy, screenCopy } from '@griever/copy';
import { ObituarySection, type ObituaryPatch } from './ObituarySection';
import { resetSessionDismissed } from './PhoneNudge';

type Values = Parameters<typeof ObituarySection>[0]['values'];

function setup(initial: Values = {}) {
  const patches: ObituaryPatch[] = [];
  const onReadyChange = vi.fn();
  const onOpenPerson = vi.fn();
  const onOpenService = vi.fn();
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
        onOpenService={onOpenService}
      />
    );
  }
  render(<Harness />);
  return { patches, onReadyChange, onOpenPerson, onOpenService };
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
    await userEvent.type(screen.getByLabelText(/Job title/), 'teacher');
    expect(text().value).toContain('worked as a teacher');
  });

  it('removes the old work, survivors and note inputs', () => {
    setup(person);
    expect(screen.queryByLabelText(/Their work/)).toBeNull();
    expect(screen.queryByLabelText(/Survived by \(optional\)/)).toBeNull();
    expect(screen.queryByLabelText(/A personal note/)).toBeNull();
  });

  it('shows only the filled Service details, read-only, and Change on Service opens Service', async () => {
    const { onOpenService } = setup({
      ...person,
      servicePlace: 'Oak Chapel',
      serviceOfficiant: 'Reverend Sam Cole',
      burialPrivate: true,
      burialPlace: 'Oak Hill',
    });
    expect(screen.getByText('Details from Service')).toBeInTheDocument();
    expect(screen.getByText('Oak Chapel')).toBeInTheDocument();
    expect(screen.getByText('Reverend Sam Cole')).toBeInTheDocument();
    expect(screen.getByText('Burial').nextElementSibling).toHaveTextContent('Will be private');
    expect(screen.queryByText('Oak Hill')).toBeNull();
    expect(screen.queryByText('Visitation date')).toBeNull();
    expect(screen.queryByRole('textbox', { name: 'Officiant' })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Change these on Service' }));
    expect(onOpenService).toHaveBeenCalledTimes(1);
  });

  it('says so, once, when nothing is filled in on Service, and keeps the button', () => {
    setup(person);
    expect(screen.getByText('Nothing is filled in on Service yet.')).toBeInTheDocument();
    expect(screen.queryByText(/We take these from the Service section/)).toBeNull();
    expect(screen.getByRole('button', { name: 'Change these on Service' })).toBeInTheDocument();
  });

  it('ties the Service hint to the list of details', () => {
    setup({ ...person, servicePlace: 'Oak Chapel' });
    const list = screen.getByText('Oak Chapel').closest('dl') as HTMLElement;
    expect(list).toHaveAccessibleDescription(/We take these from the Service section/);
  });

  it('makes the two panel labels level 2 headings', () => {
    setup(person);
    expect(screen.getByRole('heading', { level: 2, name: 'Details from The person' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'Details from Service' })).toBeInTheDocument();
  });

  it('puts the details in order: The person, Service, then the life fields and people', () => {
    setup({ ...person, servicePlace: 'Oak Chapel' });
    const top = [
      screen.getByText('Details from The person'),
      screen.getByText('Details from Service'),
      screen.getByLabelText(/Given name/),
      screen.getByText('Survived by'),
      screen.getByText('Preceded in death by'),
      text(),
    ];
    for (let i = 0; i < top.length - 1; i += 1) {
      expect(top[i].compareDocumentPosition(top[i + 1]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    }
  });

  it('typing a given name updates the text and saves at once', async () => {
    const { patches } = setup(person);
    await userEvent.type(screen.getByLabelText(/Given name/), 'Annie');
    expect(patches.at(-1)).toEqual({ obituaryGivenName: 'Annie' });
    expect(text().value).toContain('Annie');
  });

  it('adding a survivor row updates paragraph 4', async () => {
    const { patches } = setup(person);
    await userEvent.click(screen.getAllByRole('button', { name: 'Add a person' })[0]);
    await userEvent.type(screen.getByLabelText('Name, person 1'), 'Sam Lee');
    expect(patches.at(-1)).toHaveProperty('obituarySurvivorList');
    expect(text().value.split('\n\n')[3]).toContain('Sam Lee');
  });

  it('never saves the worked-out age', async () => {
    const { patches } = setup(person);
    expect(screen.getByLabelText(/^Age/)).toHaveValue('86');
    await userEvent.type(screen.getByLabelText(/Given name/), 'A');
    expect(patches.some((p) => 'obituaryAge' in p)).toBe(false);
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
    expect(screen.getByText(line)).not.toHaveAttribute('role');
    expect(screen.getByText(line)).not.toHaveAttribute('aria-live');
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

describe('ObituarySection memorial', () => {
  const addButton = () => screen.queryByRole('button', { name: 'Add Memorial' });
  const prefill = screenCopy('obituaryDraft').memorial;

  it('shows the Add Memorial button while the memorial is blank, with the primary style', () => {
    setup({ ...person, obituaryMemorial: '   ' });
    expect(addButton()).toHaveClass('gg-btn', 'gg-btn-primary');
    expect(screen.queryByLabelText('Memorial')).toBeNull();
  });

  it('saves the prefill, shows the labelled box with its hint and focuses it', async () => {
    const { patches } = setup(person);
    await userEvent.click(addButton()!);
    expect(patches).toEqual([{ obituaryMemorial: prefill }]);
    const box = screen.getByLabelText('Memorial') as HTMLTextAreaElement;
    expect(box.value).toBe(prefill);
    expect(box.value).toMatch(/^Memorial donations may be made to/);
    expect(box).toHaveFocus();
    expect(box).toHaveAccessibleDescription('Replace the placeholder text with the memorial details.');
    expect(addButton()).toBeNull();
  });

  it('sends edits as obituaryMemorial and never changes the obituary text', async () => {
    const { patches } = setup({ ...person, obituaryMemorial: 'Gifts to the library.' });
    const before = text().value;
    await userEvent.type(screen.getByLabelText('Memorial'), 'X');
    expect(patches.at(-1)).toEqual({ obituaryMemorial: 'Gifts to the library.X' });
    expect(patches.every((p) => !('obituaryText' in p))).toBe(true);
    expect(text().value).toBe(before);
    expect(text().value).not.toContain('library');
  });

  it('keeps the box and its focus while it is cleared', async () => {
    setup({ ...person, obituaryMemorial: 'Gifts' });
    const box = screen.getByLabelText('Memorial');
    await userEvent.clear(box);
    expect(screen.getByLabelText('Memorial')).toHaveFocus();
    expect(addButton()).toBeNull();
    await userEvent.type(screen.getByLabelText('Memorial'), '   ');
    expect(screen.getByLabelText('Memorial')).toBeInTheDocument();
  });

  it('on blur while blank shows the button and does not move focus to it', async () => {
    const { patches } = setup({ ...person, obituaryMemorial: 'Gifts' });
    await userEvent.clear(screen.getByLabelText('Memorial'));
    await userEvent.type(screen.getByLabelText('Memorial'), '  ');
    await userEvent.tab();
    expect(screen.queryByLabelText('Memorial')).toBeNull();
    expect(addButton()).not.toHaveFocus();
    expect(patches.at(-1)).toEqual({ obituaryMemorial: '' });
  });

  it('on blur with text keeps the box', async () => {
    setup({ ...person, obituaryMemorial: 'Gifts' });
    screen.getByLabelText('Memorial').focus();
    await userEvent.tab();
    expect(screen.getByLabelText('Memorial')).toHaveValue('Gifts');
  });

  it('does not take focus on load, saved or blank', () => {
    const { unmount } = render(
      <ObituarySection values={{ ...person, obituaryMemorial: 'Gifts' }} onChange={() => undefined} onReadyChange={() => undefined} />,
    );
    expect(document.body).toHaveFocus();
    unmount();
    setup(person);
    expect(document.body).toHaveFocus();
    expect(addButton()).not.toHaveFocus();
  });

  it('has the maxLength of its key', () => {
    setup({ ...person, obituaryMemorial: 'Gifts' });
    expect(screen.getByLabelText('Memorial')).toHaveAttribute('maxLength', String(FLOW_DETAIL_MAX_LENGTH.obituaryMemorial));
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
