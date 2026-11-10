import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { findHardCodedCopy, screenCopy } from '@griever/copy';
import { FLOW_DETAIL_MAX_LENGTH } from '@griever/shared';
import {
  ObituaryLifeFields,
  type ObituaryLifeKey,
  type ObituaryLifePatch,
  type ServiceSharedPatch,
} from './ObituaryLifeFields';

type Values = Parameters<typeof ObituaryLifeFields>[0]['values'];

let servicePatchLog: ServiceSharedPatch[] = [];

function setup(initial: Values = {}) {
  const patches: ObituaryLifePatch[] = [];
  const servicePatches: ServiceSharedPatch[] = [];
  function Harness() {
    const [values, setValues] = useState<Values>(initial);
    return (
      <ObituaryLifeFields
        values={values}
        onChange={(patch) => {
          patches.push(patch);
          setValues((v) => ({ ...v, ...patch }));
        }}
        onServiceChange={(patch) => {
          servicePatches.push(patch);
          setValues((v) => ({ ...v, ...patch }));
        }}
      />
    );
  }
  render(<Harness />);
  // A second list for the Service keys; the tests read `servicePatches` off the first.
  servicePatchLog = servicePatches;
  return patches;
}

const copy = screenCopy('cmsObituary');

const fields: [ObituaryLifeKey, string][] = [
  ['obituaryGivenName', copy.givenNameLabel],
  ['obituaryMiddleName', copy.middleNameLabel],
  ['obituarySurname', copy.surnameLabel],
  ['obituaryAge', copy.ageLabel],
  ['obituaryCity', copy.cityLabel],
  ['obituaryState', copy.stateLabel],
  ['obituaryDeathPlace', copy.deathPlaceLabel],
  ['obituaryFuneralHome', copy.funeralHomeLabel],
  ['obituaryChurch', copy.churchLabel],
  ['obituaryCemeteryLocation', copy.cemeteryLabel],
  ['obituaryBirthPlace', copy.birthPlaceLabel],
  ['obituaryMotherName', copy.motherNameLabel],
  ['obituaryFatherName', copy.fatherNameLabel],
  ['obituaryHighSchool', copy.highSchoolLabel],
  ['obituaryGradYear', copy.graduationYearLabel],
  ['obituaryDegree', copy.degreeLabel],
  ['obituaryCollege', copy.collegeLabel],
  ['obituaryJobTitle', copy.jobTitleLabel],
  ['obituaryCompany', copy.companyLabel],
  ['obituaryJobYears', copy.yearsLabel],
  ['obituaryHobbies', copy.hobbiesLabel],
  ['obituaryAwards', copy.awardsLabel],
  ['obituaryOrganizations', copy.charitiesLabel],
];

describe('ObituaryLifeFields', () => {
  it.each(fields)('%s is found by its label and sends only its own key', async (key, label) => {
    const patches = setup();
    await userEvent.type(screen.getByLabelText(label), 'x');
    expect(patches).toEqual([{ [key]: 'x' }]);
  });

  it.each(fields)('%s has the maxLength of its key', (key, label) => {
    setup();
    const cap = FLOW_DETAIL_MAX_LENGTH[key as keyof typeof FLOW_DETAIL_MAX_LENGTH];
    expect(screen.getByLabelText(label)).toHaveAttribute('maxLength', String(cap));
  });

  it('uses the numeric keypad for year and number fields but accepts text', async () => {
    const patches = setup();
    for (const label of [copy.graduationYearLabel, copy.yearsLabel, copy.ageLabel]) {
      expect(screen.getByLabelText(label)).toHaveAttribute('inputMode', 'numeric');
    }
    await userEvent.type(screen.getByLabelText(copy.yearsLabel), 'about 30');
    expect(patches.at(-1)).toEqual({ obituaryJobYears: 'about 30' });
  });

  it('fills given, middle and surname from a three-word name in one patch', async () => {
    const patches = setup({ personName: 'Ann Marie Lee' });
    await userEvent.click(screen.getByRole('button', { name: copy.useNameFromPersonLabel }));
    expect(patches).toEqual([
      { obituaryGivenName: 'Ann', obituaryMiddleName: 'Marie', obituarySurname: 'Lee' },
    ]);
    expect(screen.getByLabelText(copy.surnameLabel)).toHaveValue('Lee');
  });

  it('announces once, in a polite status line, that the name was filled', async () => {
    setup({ personName: 'Ann Lee' });
    const status = screen.getByRole('status');
    expect(status).toHaveTextContent('');
    await userEvent.click(screen.getByRole('button', { name: copy.useNameFromPersonLabel }));
    expect(status).toHaveTextContent(copy.nameFilled);
  });

  it('hides the name button without a name', () => {
    setup({ personName: '  ' });
    expect(screen.queryByRole('button', { name: copy.useNameFromPersonLabel })).toBeNull();
  });

  describe('age', () => {
    const dates = { birthDate: 'June 15, 1940', dateOfPassing: 'November 2, 2026' };

    it('starts from the dates without saving', () => {
      const patches = setup(dates);
      expect(screen.getByLabelText(copy.ageLabel)).toHaveValue('86');
      expect(patches).toEqual([]);
    });

    it('shows only what was typed while focused, and the worked-out age again on blur', async () => {
      const patches = setup(dates);
      const age = screen.getByLabelText(copy.ageLabel);
      await userEvent.click(age);
      expect(age).toHaveValue('');
      expect(patches).toEqual([]);
      await userEvent.type(age, '9');
      expect(patches.at(-1)).toEqual({ obituaryAge: '9' });
      expect(age).toHaveValue('9');
      await userEvent.clear(age);
      expect(patches.at(-1)).toEqual({ obituaryAge: '' });
      expect(age).toHaveValue('');
      await userEvent.tab();
      expect(age).toHaveValue('86');
    });

    it('shows the hint only while the worked-out age is shown', async () => {
      setup(dates);
      const age = screen.getByLabelText(copy.ageLabel);
      expect(screen.getByText(copy.ageHint)).toBeInTheDocument();
      expect(age).toHaveAccessibleDescription(copy.ageHint);
      await userEvent.click(age);
      expect(screen.queryByText(copy.ageHint)).toBeNull();
      expect(age).not.toHaveAccessibleDescription(copy.ageHint);
      await userEvent.type(age, '{Backspace}');
      await userEvent.tab();
      expect(screen.getByText(copy.ageHint)).toBeInTheDocument();
    });

    it('shows a saved age over the worked-out one', () => {
      setup({ ...dates, obituaryAge: '85' });
      expect(screen.getByLabelText(copy.ageLabel)).toHaveValue('85');
    });

    it('is empty when the dates do not parse', () => {
      setup({ birthDate: 'soon', dateOfPassing: 'November 2, 2026' });
      expect(screen.getByLabelText(copy.ageLabel)).toHaveValue('');
    });
  });

  describe('pronoun', () => {
    it('is a native select with not chosen, he, she, they', () => {
      setup();
      const select = screen.getByLabelText(copy.pronounLabel);
      expect(select.tagName).toBe('SELECT');
      expect(Array.from((select as HTMLSelectElement).options).map((o) => [o.value, o.text])).toEqual([
        ['', 'Not chosen'],
        ['he', 'He'],
        ['she', 'She'],
        ['they', 'They'],
      ]);
    });

    it('sends the choice, and an empty value for not chosen', async () => {
      const patches = setup({ obituaryPronoun: 'she' });
      const select = screen.getByLabelText(copy.pronounLabel);
      expect(select).toHaveValue('she');
      await userEvent.selectOptions(select, 'they');
      await userEvent.selectOptions(select, 'Not chosen');
      expect(patches).toEqual([{ obituaryPronoun: 'they' }, { obituaryPronoun: '' }]);
    });
  });

  describe('sections', () => {
    const headings = [
      copy.groupNameHeading,
      copy.groupLifeHeading,
      copy.groupFamilyHeading,
      copy.groupServiceHeading,
    ];
    const button = (name: string) => screen.getByRole('button', { name });

    it('has four level 2 headings with a button each, and only the name open', () => {
      setup();
      for (const heading of headings) {
        expect(screen.getByRole('heading', { level: 2, name: heading })).toBeInTheDocument();
      }
      expect(headings.map((h) => button(h).getAttribute('aria-expanded'))).toEqual([
        'true', 'false', 'false', 'false',
      ]);
    });

    it('points each button at a panel that is hidden while closed', () => {
      setup();
      for (const heading of headings) {
        const panel = document.getElementById(button(heading).getAttribute('aria-controls') ?? '');
        expect(panel).not.toBeNull();
        expect(panel?.hasAttribute('hidden')).toBe(heading !== copy.groupNameHeading);
      }
    });

    it('opens and closes on click without moving focus, and the caret turns', async () => {
      setup();
      const life = button(copy.groupLifeHeading);
      const caret = life.querySelector('[data-chevron]');
      expect(caret).not.toHaveClass('rotate-180');
      await userEvent.click(life);
      expect(life).toHaveAttribute('aria-expanded', 'true');
      expect(life).toHaveFocus();
      expect(caret).toHaveClass('rotate-180');
      await userEvent.click(life);
      expect(life).toHaveAttribute('aria-expanded', 'false');
      expect(life).toHaveFocus();
    });

    it('names each group by its heading, and shows the heading once', async () => {
      setup();
      for (const heading of headings.slice(1)) {
        await userEvent.click(button(heading));
      }
      for (const heading of headings) {
        expect(screen.getByRole('group', { name: heading })).toBeInTheDocument();
        expect(screen.getAllByText(heading)).toHaveLength(1);
      }
    });

    it('keeps typed values while a section is closed', async () => {
      setup();
      const life = button(copy.groupLifeHeading);
      await userEvent.click(life);
      await userEvent.type(screen.getByLabelText(copy.hobbiesLabel), 'chess');
      await userEvent.click(life);
      await userEvent.click(life);
      expect(screen.getByLabelText(copy.hobbiesLabel)).toHaveValue('chess');
    });

    it('lays the fields out row by row, with the half-width and full-width cells', async () => {
      setup();
      await userEvent.click(button(copy.groupLifeHeading));
      const group = screen.getByRole('group', { name: copy.groupLifeHeading });
      const grid = group.querySelector('.grid');
      expect(grid).toHaveClass('grid-cols-1', 'md:grid-cols-2');
      const labels = Array.from(grid?.children ?? []).map((cell) => ({
        label: cell.querySelector('label')?.textContent,
        full: cell.classList.contains('md:col-span-2'),
      }));
      expect(labels.map((l) => l.label)).toEqual([
        copy.ageLabel, copy.birthPlaceLabel,
        copy.cityLabel, copy.stateLabel,
        copy.deathPlaceLabel,
        copy.highSchoolLabel, copy.graduationYearLabel,
        copy.collegeLabel, copy.degreeLabel,
        copy.jobTitleLabel, copy.companyLabel,
        copy.yearsLabel,
        copy.hobbiesLabel, copy.awardsLabel, copy.charitiesLabel,
      ]);
      expect(labels.filter((l) => l.full).map((l) => l.label)).toEqual([
        copy.deathPlaceLabel, copy.hobbiesLabel, copy.awardsLabel, copy.charitiesLabel,
      ]);
    });

    it('puts the name button above the grid, then Given, Middle, Surname, Pronoun', () => {
      setup({ personName: 'Ann Lee' });
      const group = screen.getByRole('group', { name: copy.groupNameHeading });
      expect(group.firstElementChild).toBe(screen.getByRole('button', { name: copy.useNameFromPersonLabel }));
      const order = Array.from(group.querySelectorAll('label')).map((l) => l.textContent);
      expect(order).toEqual([copy.givenNameLabel, copy.middleNameLabel, copy.surnameLabel, copy.pronounLabel]);
    });
  });

  describe('shared Service fields', () => {
    it('shows the saved cemetery, officiant and private choice', () => {
      setup({ burialPlace: 'Oak Hill', serviceOfficiant: 'Rev. Cole' });
      expect(screen.getByLabelText(copy.cemeteryNameLabel)).toHaveValue('Oak Hill');
      expect(screen.getByLabelText(copy.officiantFieldLabel)).toHaveValue('Rev. Cole');
      expect(screen.getByLabelText(copy.burialPrivateLabel)).not.toBeChecked();
    });

    it('sends only the cemetery through onServiceChange', async () => {
      const patches = setup();
      await userEvent.type(screen.getByLabelText(copy.cemeteryNameLabel), 'x');
      expect(servicePatchLog).toEqual([{ burialPlace: 'x' }]);
      expect(patches).toEqual([]);
    });

    it('sends only the officiant through onServiceChange', async () => {
      setup();
      await userEvent.type(screen.getByLabelText(copy.officiantFieldLabel), 'y');
      expect(servicePatchLog).toEqual([{ serviceOfficiant: 'y' }]);
    });

    it('hides the cemetery fields when burial is private, and shows them again when cleared', async () => {
      setup({ burialPlace: 'Oak Hill' });
      await userEvent.click(screen.getByLabelText(copy.burialPrivateLabel));
      expect(servicePatchLog).toEqual([{ burialPrivate: true }]);
      expect(screen.queryByLabelText(copy.cemeteryNameLabel)).not.toBeInTheDocument();
      expect(screen.queryByLabelText(copy.cemeteryLabel)).not.toBeInTheDocument();
      await userEvent.click(screen.getByLabelText(copy.burialPrivateLabel));
      expect(screen.getByLabelText(copy.cemeteryNameLabel)).toHaveValue('Oak Hill');
    });

    it('shows one hint that these are the same as on Service', () => {
      setup();
      expect(screen.getAllByText(copy.serviceSharedHint)).toHaveLength(1);
    });

    it('does not mark the cemetery location optional', () => {
      expect(copy.cemeteryLabel).not.toMatch(/optional/i);
    });
  });

  it('holds no hard-coded copy', () => {
    const source = readFileSync(join(import.meta.dirname, 'ObituaryLifeFields.tsx'), 'utf8');
    expect(findHardCodedCopy(source, 'cmsObituary')).toEqual([]);
  });
});
