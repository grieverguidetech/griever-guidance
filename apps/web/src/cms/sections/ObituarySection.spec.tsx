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
  const servicePatches: Record<string, unknown>[] = [];
  const personPatches: Record<string, unknown>[] = [];
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
        onServiceChange={(patch) => {
          servicePatches.push(patch);
          setValues((v) => ({ ...v, ...patch }));
        }}
        onPersonChange={(patch) => {
          personPatches.push(patch);
          setValues((v) => ({ ...v, ...patch }));
        }}
        onReadyChange={onReadyChange}
      />
    );
  }
  render(<Harness />);
  return { patches, servicePatches, personPatches, onReadyChange };
}

const text = () => screen.getByLabelText('Obituary') as HTMLTextAreaElement;
const person = { personName: 'Ann Lee', dateOfPassing: 'June 1, 2026', birthDate: 'May 2, 1940' };

describe('ObituarySection', () => {
  it('has no Details from The person card and no button to open The person', () => {
    setup(person);
    expect(screen.queryByText('Details from The person')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Change these on The person' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Use the name from The person' })).toBeNull();
  });

  it('shows the person dates as editable fields and sends only the typed one through onPersonChange', async () => {
    const { personPatches, patches } = setup(person);
    expect(screen.getByLabelText('Date of birth (optional)')).toHaveValue('May 2, 1940');
    expect(screen.getByLabelText('Date they passed (optional)')).toHaveValue('June 1, 2026');
    await userEvent.type(screen.getByLabelText('Date of birth (optional)'), '1');
    expect(personPatches).toEqual([{ birthDate: 'May 2, 19401' }]);
    expect(patches).toEqual([]);
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

  it('has no read-only Service card and no button to open Service', () => {
    setup({ ...person, servicePlace: 'Oak Chapel' });
    expect(screen.queryByText('Details from Service')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Change these on Service' })).toBeNull();
    expect(screen.queryByText('Nothing is filled in on Service yet.')).toBeNull();
  });

  it('shows the saved service and visitation values as editable fields', () => {
    setup({ ...person, servicePlace: 'Oak Chapel', serviceTime: '2:00 PM', visitationPlace: 'Hall' });
    expect(screen.getByLabelText('Funeral or memorial service Place')).toHaveValue('Oak Chapel');
    expect(screen.getByLabelText('Funeral or memorial service Time')).toHaveValue('14:00');
    expect(screen.getByLabelText('Visitation or calling hours Place')).toHaveValue('Hall');
  });

  it('puts the details in order: the life fields, then the people, then the text', () => {
    setup({ ...person, servicePlace: 'Oak Chapel' });
    const top = [
      screen.getByLabelText(/Given name/),
      screen.getByText('Survived by'),
      screen.getByText('Preceded in death by'),
      text(),
    ];
    for (let i = 0; i < top.length - 1; i += 1) {
      expect(top[i].compareDocumentPosition(top[i + 1]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    }
  });

  it('opens only the name section on load, and the six sections open independently', async () => {
    setup(person);
    const names = [
      "The person's name",
      'Their life',
      'Their family',
      'Funeral home and place of worship',
      'Survived by',
      'Preceded in death by',
    ];
    const buttons = names.map((name) => screen.getByRole('button', { name: new RegExp(`^${name}`) }));
    expect(buttons.map((b) => b.getAttribute('aria-expanded'))).toEqual([
      'true', 'false', 'false', 'false', 'false', 'false',
    ]);
    await userEvent.click(buttons[1]);
    expect(buttons[1]).toHaveAttribute('aria-expanded', 'true');
    expect(buttons[0]).toHaveAttribute('aria-expanded', 'true');
  });

  it('typing a given name updates the text and saves at once', async () => {
    const { patches } = setup({ ...person, personName: '' });
    await userEvent.type(screen.getByLabelText(/Given name/), 'Annie');
    expect(patches.at(-1)).toEqual({ obituaryGivenName: 'Annie' });
    expect(text().value).toContain('Annie');
  });

  it('adding a survivor row updates paragraph 4', async () => {
    const { patches } = setup(person);
    await userEvent.click(screen.getByRole('button', { name: 'Survived by' }));
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

  it('typing the cemetery goes to onServiceChange and removes [CEMETERY NAME] from the unedited text', async () => {
    const { patches, servicePatches } = setup(person);
    expect(text().value).toContain('[CEMETERY NAME]');
    await userEvent.type(screen.getByLabelText(screenCopy('cmsService').eventCemetery), 'Oak Hill');
    expect(servicePatches.at(-1)).toEqual({ burialPlace: 'Oak Hill' });
    expect(patches).toEqual([]);
    expect(text().value).not.toContain('[CEMETERY NAME]');
    expect(text().value).toContain('Oak Hill');
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

  describe('Mark as ready with placeholders (#779)', () => {
    const message = 'Some placeholder text is still in [brackets]. Replace it before you mark this ready.';
    const memorialMessage = 'Some placeholder text is still in [brackets] in the Memorial. Replace it before you mark this ready.';
    const bothMessage = 'Some placeholder text is still in [brackets] in the obituary and in the Memorial. Replace it before you mark this ready.';
    const toggle = () => screen.getByRole('button', { name: 'Mark as ready' });

    it('refuses the untouched template, with the message in the toggle description', async () => {
      const { onReadyChange } = setup(person);
      expect(toggle()).toHaveAttribute('aria-disabled', 'true');
      expect(toggle()).toHaveAccessibleDescription(expect.stringContaining(message));
      await userEvent.click(toggle());
      expect(onReadyChange).not.toHaveBeenCalled();
    });

    it('has no hint line under the text', () => {
      setup(person);
      expect(screen.queryByText(/still to fill in/)).toBeNull();
      expect(text()).not.toHaveAccessibleDescription(expect.stringContaining('brackets'));
    });

    it('refuses an edited text that still has a legacy Step 1 word', async () => {
      const { onReadyChange } = setup(person);
      await userEvent.clear(text());
      await userEvent.type(text(), 'Ann Lee loved gardens [[SCHOOL NAME].');
      expect(toggle()).toHaveAttribute('aria-disabled', 'true');
      await userEvent.click(toggle());
      expect(onReadyChange).not.toHaveBeenCalled();
    });

    it('refuses a placeholder in the memorial', async () => {
      const { onReadyChange } = setup({ ...person, obituaryText: 'Ann Lee loved gardens.', obituaryMemorial: 'Gifts to [CHARITIES/ORGANIZATIONS].' });
      expect(toggle()).toHaveAttribute('aria-disabled', 'true');
      await userEvent.click(toggle());
      expect(onReadyChange).not.toHaveBeenCalled();
    });

    it('does not block a fully typed text and memorial', async () => {
      const { onReadyChange } = setup({ ...person, obituaryText: 'Ann Lee loved gardens.', obituaryMemorial: 'Gifts to the garden club.' });
      expect(toggle()).not.toHaveAttribute('aria-disabled', 'true');
      await userEvent.click(toggle());
      expect(onReadyChange).toHaveBeenCalledWith(true);
    });

    it("does not block a family's own brackets", async () => {
      const { onReadyChange } = setup({ ...person, obituaryText: 'Ann Lee loved gardens [[my note].', obituaryMemorial: 'See [[the club].' });
      expect(toggle()).not.toHaveAttribute('aria-disabled', 'true');
      await userEvent.click(toggle());
      expect(onReadyChange).toHaveBeenCalledWith(true);
    });

    it('refuses once the Add Memorial switch is on, and allows Ready after a real memorial is typed', async () => {
      const { onReadyChange } = setup({ ...person, obituaryText: 'Ann Lee loved gardens.' });
      expect(toggle()).not.toHaveAttribute('aria-disabled', 'true');
      await userEvent.click(screen.getByRole('switch', { name: 'Add Memorial' }));
      expect(toggle()).toHaveAttribute('aria-disabled', 'true');
      expect(toggle()).toHaveAccessibleDescription(expect.stringContaining(memorialMessage));
      await userEvent.click(toggle());
      expect(onReadyChange).not.toHaveBeenCalled();
      const memorial = screen.getByLabelText('Memorial');
      await userEvent.clear(memorial);
      await userEvent.type(memorial, 'Gifts to the garden club.');
      expect(toggle()).not.toHaveAttribute('aria-disabled', 'true');
      await userEvent.click(toggle());
      expect(onReadyChange).toHaveBeenCalledWith(true);
    });

    it('stops naming the Memorial when the switch is turned off, so Ready is allowed', async () => {
      setup({ ...person, obituaryText: 'Ann Lee loved gardens.' });
      await userEvent.click(screen.getByRole('switch', { name: 'Add Memorial' }));
      expect(toggle()).toHaveAccessibleDescription(expect.stringContaining(memorialMessage));
      await userEvent.click(screen.getByRole('switch', { name: 'Add Memorial' }));
      expect(toggle()).not.toHaveAttribute('aria-disabled', 'true');
    });

    it('names both when the obituary and the Memorial both have placeholders', async () => {
      setup(person);
      await userEvent.click(screen.getByRole('switch', { name: 'Add Memorial' }));
      expect(toggle()).toHaveAccessibleDescription(expect.stringContaining(bothMessage));
    });

    it('always lets Ready be turned off', async () => {
      const onReadyChange = vi.fn();
      render(
        <ObituarySection
          values={{ ...person, sectionStatus: { obituary: 'ready' } }}
          onChange={() => undefined}
          onServiceChange={() => undefined}
          onPersonChange={() => undefined}
          onReadyChange={onReadyChange}
        />,
      );
      expect(toggle()).toHaveAttribute('aria-pressed', 'true');
      expect(toggle()).not.toHaveAttribute('aria-disabled', 'true');
      expect(screen.queryByText(message)).not.toBeInTheDocument();
      await userEvent.click(toggle());
      expect(onReadyChange).toHaveBeenCalledWith(false);
    });

    it('stays Ready when a bracket comes back', async () => {
      setup({ ...person, obituaryText: 'Ann Lee loved gardens.', sectionStatus: { obituary: 'ready' } });
      await userEvent.type(text(), ' [[SCHOOL NAME]');
      expect(text().value).toContain('[SCHOOL NAME]');
      expect(toggle()).toHaveAttribute('aria-pressed', 'true');
      expect(toggle()).not.toHaveAttribute('aria-disabled', 'true');
      expect(screen.queryByText(message)).not.toBeInTheDocument();
    });
  });

  it('has no where-it-is-published inputs', () => {
    setup();
    expect(screen.queryByLabelText(/Link to the obituary/)).toBeNull();
    expect(screen.queryByLabelText(/Where it is published/)).toBeNull();
  });

  // The text is seeded: the untouched template has [BRACKETS], so Ready would be refused (#779).
  it('marks ready through MarkReady', async () => {
    const { onReadyChange } = setup({ obituaryText: 'Ann Lee loved gardens.' });
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

describe('ObituarySection layout and groups', () => {
  it("opens The person's name on first render and leaves the other groups closed", () => {
    setup(person);
    expect(screen.getByRole('button', { name: "The person's name" })).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('button', { name: 'Their life' })).toHaveAttribute('aria-expanded', 'false');
  });

  it('does not block Ready for an empty memorial', () => {
    setup({ ...person, obituaryText: 'Ann Lee loved gardens.' });
    expect(screen.getByRole('button', { name: 'Mark as ready' })).not.toHaveAttribute('aria-disabled', 'true');
  });
});

describe('ObituarySection memorial', () => {
  const prefill = screenCopy('obituaryDraft').memorial;
  const memorialSwitch = () => screen.getByRole('switch', { name: 'Add Memorial' });

  it('has an h2 and an Add Memorial switch that is off on load when blank, with no box', () => {
    setup(person);
    expect(screen.getByRole('heading', { level: 2, name: 'Memorial (optional)' })).toBeInTheDocument();
    expect(memorialSwitch()).toHaveAttribute('aria-checked', 'false');
    expect(memorialSwitch()).toHaveClass('min-h-11');
    expect(screen.queryByLabelText('Memorial')).toBeNull();
  });

  it('is on at load when a memorial is saved', () => {
    setup({ ...person, obituaryMemorial: 'Gifts' });
    expect(memorialSwitch()).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByLabelText('Memorial')).toBeVisible();
  });

  it('is off at load when the saved memorial is only spaces', () => {
    setup({ ...person, obituaryMemorial: '   ' });
    expect(memorialSwitch()).toHaveAttribute('aria-checked', 'false');
    expect(screen.queryByLabelText('Memorial')).toBeNull();
  });

  it('on: saves the prefill, shows the labelled box with its hint and focuses it', async () => {
    const { patches } = setup(person);
    await userEvent.click(memorialSwitch());
    expect(patches).toEqual([{ obituaryMemorial: prefill }]);
    expect(memorialSwitch()).toHaveAttribute('aria-checked', 'true');
    const box = screen.getByLabelText('Memorial') as HTMLTextAreaElement;
    expect(box.value).toBe(prefill);
    expect(box.value).toMatch(/^Memorial donations may be made to/);
    expect(box).toHaveFocus();
    expect(box).toHaveAccessibleDescription('Replace the placeholder text with the memorial details.');
  });

  it('off: clears the memorial, hides the box and keeps focus on the switch', async () => {
    const { patches } = setup({ ...person, obituaryMemorial: 'Gifts' });
    await userEvent.click(memorialSwitch());
    expect(patches.at(-1)).toEqual({ obituaryMemorial: '' });
    expect(memorialSwitch()).toHaveAttribute('aria-checked', 'false');
    expect(memorialSwitch()).toHaveFocus();
    expect(screen.queryByLabelText('Memorial')).toBeNull();
  });

  it('on again after off brings the template back', async () => {
    setup({ ...person, obituaryMemorial: 'Gifts' });
    await userEvent.click(memorialSwitch());
    await userEvent.click(memorialSwitch());
    expect(screen.getByLabelText('Memorial')).toHaveValue(prefill);
    expect(screen.getByLabelText('Memorial')).toHaveFocus();
  });

  it('works from the keyboard', async () => {
    setup(person);
    memorialSwitch().focus();
    await userEvent.keyboard('{Enter}');
    expect(memorialSwitch()).toHaveAttribute('aria-checked', 'true');
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

  it('keeps the box while it is cleared, even after leaving it', async () => {
    setup({ ...person, obituaryMemorial: 'Gifts' });
    await userEvent.clear(screen.getByLabelText('Memorial'));
    await userEvent.tab();
    expect(screen.getByLabelText('Memorial')).toBeInTheDocument();
    expect(memorialSwitch()).toHaveAttribute('aria-checked', 'true');
  });

  it('does not take focus on load, saved or blank', () => {
    const { unmount } = render(
      <ObituarySection
        values={{ ...person, obituaryMemorial: 'Gifts' }}
        onChange={() => undefined}
        onServiceChange={() => undefined}
        onPersonChange={() => undefined}
        onReadyChange={() => undefined}
      />,
    );
    expect(document.body).toHaveFocus();
    unmount();
    setup(person);
    expect(document.body).toHaveFocus();
    expect(memorialSwitch()).not.toHaveFocus();
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

  // The text is seeded so the untouched template (which is blocked) does not stop these tests from marking ready.
  function renderReadyToggle() {
    function Ready() {
      const [ready, setReady] = useState(false);
      return (
        <ObituarySection
          values={{ obituaryText: 'Ann Lee loved gardens.', sectionStatus: { obituary: ready ? 'ready' : 'in_progress' } }}
          onChange={() => undefined}
          onServiceChange={() => undefined}
          onPersonChange={() => undefined}
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
