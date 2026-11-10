import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { useState } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { findHardCodedCopy, screenCopy } from '@griever/copy';
import { FLOW_DETAIL_MAX_LENGTH } from '@griever/shared';
import { PlacesProvider } from '../../lib/places/PlacesContext';
import type { PlacesClient } from '../../lib/places/placesClient';
import {
  ObituaryLifeFields,
  type ObituaryLifeKey,
  type ObituaryLifePatch,
  type PersonSharedPatch,
  type ServiceSharedPatch,
} from './ObituaryLifeFields';

type Values = Parameters<typeof ObituaryLifeFields>[0]['values'];

function setup(initial: Values = {}) {
  const patches: ObituaryLifePatch[] = [];
  const servicePatches: ServiceSharedPatch[] = [];
  const personPatches: PersonSharedPatch[] = [];
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
        onPersonChange={(patch) => {
          personPatches.push(patch);
          setValues((v) => ({ ...v, ...patch }));
        }}
      />
    );
  }
  render(<Harness />);
  return { patches, servicePatches, personPatches };
}

const copy = screenCopy('cmsObituary');
const serviceCopy = screenCopy('cmsService');
const personCopy = screenCopy('cmsPerson');
const birthLabel = `${personCopy.dateOfBirthLabel} ${personCopy.optional}`;
const passingLabel = `${personCopy.dateOfPassingLabel} ${personCopy.optional}`;

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
    const { patches } = setup();
    await userEvent.type(screen.getByLabelText(label), 'x');
    expect(patches).toEqual([{ [key]: 'x' }]);
  });

  it.each(fields)('%s has the maxLength of its key', (key, label) => {
    setup();
    const cap = FLOW_DETAIL_MAX_LENGTH[key as keyof typeof FLOW_DETAIL_MAX_LENGTH];
    expect(screen.getByLabelText(label)).toHaveAttribute('maxLength', String(cap));
  });

  it('uses the numeric keypad for year and number fields but accepts text', async () => {
    const { patches } = setup();
    for (const label of [copy.graduationYearLabel, copy.yearsLabel, copy.ageLabel]) {
      expect(screen.getByLabelText(label)).toHaveAttribute('inputMode', 'numeric');
    }
    await userEvent.type(screen.getByLabelText(copy.yearsLabel), 'about 30');
    expect(patches.at(-1)).toEqual({ obituaryJobYears: 'about 30' });
  });

  describe('name parts from The person', () => {
    it('shows the split person name while all three parts are empty, without saving', () => {
      const { patches, personPatches } = setup({ personName: 'Ann Marie Lee' });
      expect(screen.getByLabelText(copy.givenNameLabel)).toHaveValue('Ann');
      expect(screen.getByLabelText(copy.middleNameLabel)).toHaveValue('Marie');
      expect(screen.getByLabelText(copy.surnameLabel)).toHaveValue('Lee');
      expect(patches).toEqual([]);
      expect(personPatches).toEqual([]);
    });

    it('saves all three parts when one is typed over the shown name, and never the person name', async () => {
      const { patches, personPatches } = setup({ personName: 'Ann Marie Lee' });
      await userEvent.type(screen.getByLabelText(copy.surnameLabel), 'x');
      expect(patches).toEqual([
        { obituaryGivenName: 'Ann', obituaryMiddleName: 'Marie', obituarySurname: 'Leex' },
      ]);
      expect(personPatches).toEqual([]);
      expect(screen.getByLabelText(copy.givenNameLabel)).toHaveValue('Ann');
    });

    it('sends only the typed key once a part is saved', async () => {
      const { patches } = setup({ personName: 'Ann Lee', obituaryGivenName: 'Anne' });
      expect(screen.getByLabelText(copy.surnameLabel)).toHaveValue('');
      await userEvent.type(screen.getByLabelText(copy.surnameLabel), 'L');
      expect(patches).toEqual([{ obituarySurname: 'L' }]);
    });

    it('keeps a cleared part cleared and does not bring the person name back', async () => {
      setup({ personName: 'Mom' });
      const given = screen.getByLabelText(copy.givenNameLabel);
      expect(given).toHaveValue('Mom');
      await userEvent.clear(given);
      expect(given).toHaveValue('');
      await userEvent.tab();
      expect(screen.getByLabelText(copy.givenNameLabel)).toHaveValue('');
    });

    it('keeps two cleared parts cleared', async () => {
      setup({ personName: 'Ann Lee' });
      await userEvent.clear(screen.getByLabelText(copy.givenNameLabel));
      await userEvent.clear(screen.getByLabelText(copy.surnameLabel));
      expect(screen.getByLabelText(copy.givenNameLabel)).toHaveValue('');
      expect(screen.getByLabelText(copy.surnameLabel)).toHaveValue('');
    });

    it('shows a hint tied to the three name parts only while they show the person name', async () => {
      setup({ personName: 'Ann Lee' });
      expect(screen.getByText(copy.nameFromPersonHint)).toBeVisible();
      for (const label of [copy.givenNameLabel, copy.middleNameLabel, copy.surnameLabel]) {
        expect(screen.getByLabelText(label)).toHaveAccessibleDescription(copy.nameFromPersonHint);
      }
      await userEvent.type(screen.getByLabelText(copy.middleNameLabel), 'M');
      expect(screen.queryByText(copy.nameFromPersonHint)).toBeNull();
      expect(screen.getByLabelText(copy.givenNameLabel)).not.toHaveAccessibleDescription();
    });

    it('shows no hint without a person name', () => {
      setup();
      expect(screen.queryByText(copy.nameFromPersonHint)).toBeNull();
    });

    it('has no name button and no status line', () => {
      setup({ personName: 'Ann Lee' });
      expect(screen.queryByRole('button', { name: /name from The person/i })).toBeNull();
      expect(screen.queryByRole('status')).toBeNull();
    });
  });

  describe('shared Person dates', () => {
    it('shows the saved dates', () => {
      setup({ birthDate: 'June 15, 1940', dateOfPassing: 'November 2, 2026' });
      expect(screen.getByLabelText(birthLabel)).toHaveValue('June 15, 1940');
      expect(screen.getByLabelText(passingLabel)).toHaveValue('November 2, 2026');
    });

    it('sends only the typed date through onPersonChange', async () => {
      const { patches, personPatches } = setup();
      await userEvent.type(screen.getByLabelText(birthLabel), '5');
      expect(personPatches).toEqual([{ birthDate: '5' }]);
      await userEvent.type(screen.getByLabelText(passingLabel), '6');
      expect(personPatches.at(-1)).toEqual({ dateOfPassing: '6' });
      expect(patches).toEqual([]);
    });

    it('saves a complete date in the format The person uses', async () => {
      const { personPatches } = setup();
      await userEvent.type(screen.getByLabelText(birthLabel), '6/15/2001');
      await userEvent.tab();
      expect(personPatches.at(-1)).toEqual({ birthDate: 'June 15, 2001' });
    });

    it('shows The person notes', () => {
      setup({ birthDate: 'June 15, 2030', dateOfPassing: 'November 2, 2026' });
      expect(screen.getByText(personCopy.birthAfterPassing)).toBeInTheDocument();
    });

    it('shows the future-passing note', () => {
      setup({ dateOfPassing: 'January 1, 2099' });
      expect(screen.getByText(personCopy.futurePassing)).toBeInTheDocument();
    });

    it('shows the unreadable note only after leaving the field', async () => {
      setup();
      await userEvent.type(screen.getByLabelText(passingLabel), 'last tuesday');
      expect(screen.queryByText(personCopy.dateUnreadable)).toBeNull();
      await userEvent.tab();
      expect(screen.getByText(personCopy.dateUnreadable)).toBeInTheDocument();
    });

    it('shows one hint, as the description of both date fields', () => {
      setup();
      expect(screen.getAllByText(copy.personSharedHint)).toHaveLength(1);
      for (const label of [birthLabel, passingLabel]) {
        expect(screen.getByLabelText(label)).toHaveAccessibleDescription(expect.stringContaining(copy.personSharedHint));
      }
    });
  });

  describe('age', () => {
    const dates = { birthDate: 'June 15, 1940', dateOfPassing: 'November 2, 2026' };

    it('starts from the dates without saving', () => {
      const { patches } = setup(dates);
      expect(screen.getByLabelText(copy.ageLabel)).toHaveValue('86');
      expect(patches).toEqual([]);
    });

    it('shows only what was typed while focused, and the worked-out age again on blur', async () => {
      const { patches } = setup(dates);
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
      const { patches } = setup({ obituaryPronoun: 'she' });
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
      copy.groupEventsHeading,
      copy.groupServiceHeading,
    ];
    const button = (name: string) => screen.getByRole('button', { name });

    it('has five level 2 headings with a button each, and only the name open', () => {
      setup();
      for (const heading of headings) {
        expect(screen.getByRole('heading', { level: 2, name: heading })).toBeInTheDocument();
      }
      expect(headings.map((h) => button(h).getAttribute('aria-expanded'))).toEqual([
        'true', 'false', 'false', 'false', 'false',
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

    it('puts Given, Middle, Surname, Pronoun, then the two shared dates', () => {
      setup({ personName: 'Ann Lee' });
      const group = screen.getByRole('group', { name: copy.groupNameHeading });
      const order = Array.from(group.querySelectorAll('label')).map((l) => l.textContent);
      expect(order).toEqual([
        copy.givenNameLabel, copy.middleNameLabel, copy.surnameLabel, copy.pronounLabel, birthLabel, passingLabel,
      ]);
    });
  });

  describe('shared Service fields', () => {
    it('shows the saved cemetery, officiant and private choice', () => {
      setup({ burialPlace: 'Oak Hill', serviceOfficiant: 'Rev. Cole' });
      expect(screen.getByLabelText(serviceCopy.eventCemetery)).toHaveValue('Oak Hill');
      expect(screen.getByLabelText(serviceCopy.eventOfficiant)).toHaveValue('Rev. Cole');
      expect(screen.getByLabelText(serviceCopy.eventPrivateFamily)).not.toBeChecked();
    });

    it('sends only the cemetery through onServiceChange', async () => {
      const { patches, servicePatches } = setup();
      await userEvent.type(screen.getByLabelText(serviceCopy.eventCemetery), 'x');
      expect(servicePatches).toEqual([{ burialPlace: 'x' }]);
      expect(patches).toEqual([]);
    });

    it('sends only the officiant through onServiceChange', async () => {
      const { servicePatches } = setup();
      await userEvent.type(screen.getByLabelText(serviceCopy.eventOfficiant), 'y');
      expect(servicePatches).toEqual([{ serviceOfficiant: 'y' }]);
    });

    it('hides the cemetery fields when burial is private, and shows them again when cleared', async () => {
      const { servicePatches } = setup({ burialPlace: 'Oak Hill' });
      await userEvent.click(screen.getByLabelText(serviceCopy.eventPrivateFamily));
      expect(servicePatches).toEqual([{ burialPrivate: true }]);
      expect(screen.queryByLabelText(serviceCopy.eventCemetery)).not.toBeInTheDocument();
      expect(screen.queryByLabelText(copy.cemeteryLabel)).not.toBeInTheDocument();
      await userEvent.click(screen.getByLabelText(serviceCopy.eventPrivateFamily));
      expect(screen.getByLabelText(serviceCopy.eventCemetery)).toHaveValue('Oak Hill');
    });

    it('shows one hint in each group that these are the same as on Service', () => {
      setup();
      expect(screen.getAllByText(copy.serviceSharedHint)).toHaveLength(2);
      const block = document.querySelector('[data-group="service-shared"]') as HTMLElement;
      expect(block.querySelectorAll('p.gg-hint')).toHaveLength(1);
    });

    it('gives the hint as the description of the three shared controls, and not of the Obituary-only fields', () => {
      setup();
      for (const label of [serviceCopy.eventOfficiant, serviceCopy.eventPrivateFamily, serviceCopy.eventCemetery]) {
        expect(screen.getByLabelText(label)).toHaveAccessibleDescription(copy.serviceSharedHint);
      }
      for (const label of [copy.funeralHomeLabel, copy.churchLabel, copy.cemeteryLabel]) {
        expect(screen.getByLabelText(label)).not.toHaveAccessibleDescription(copy.serviceSharedHint);
      }
    });

    it('keeps the funeral home, church and cemetery location outside the shared block', () => {
      setup();
      const block = document.querySelector('[data-group="service-shared"]') as HTMLElement;
      expect(block).toContainElement(screen.getByLabelText(serviceCopy.eventCemetery));
      for (const label of [copy.funeralHomeLabel, copy.churchLabel, copy.cemeteryLabel]) {
        expect(block).not.toContainElement(screen.getByLabelText(label));
      }
    });

    it('does not mark the cemetery location optional', () => {
      expect(copy.cemeteryLabel).not.toMatch(/optional/i);
    });
  });

  describe('shared service and visitation fields', () => {
    const service = 'Funeral or memorial service';
    const visitation = 'Visitation or calling hours';

    it('shows the saved values, with Service labels', () => {
      setup({
        servicePlace: 'Oak Chapel',
        serviceDate: 'June 5, 2026',
        serviceTime: '2:00 PM',
        visitationPlace: 'Hall',
        visitationDate: 'June 4, 2026',
        visitationTime: '6:00 PM',
      });
      expect(screen.getByLabelText(`${service} Place`)).toHaveValue('Oak Chapel');
      expect(screen.getByLabelText(`${service} Date`)).toHaveValue('June 5, 2026');
      expect(screen.getByLabelText(`${service} Time`)).toHaveValue('14:00');
      expect(screen.getByLabelText(`${visitation} Place`)).toHaveValue('Hall');
      expect(screen.getByLabelText(`${visitation} Date`)).toHaveValue('June 4, 2026');
      expect(screen.getByLabelText(`${visitation} Time`)).toHaveValue('18:00');
    });

    it('sends only the typed key through onServiceChange', async () => {
      const { patches, servicePatches } = setup();
      // The time control speaks 24-hour; the saved value is the Service format.
      fireEvent.change(screen.getByLabelText(`${service} Time`), { target: { value: '14:00' } });
      await userEvent.type(screen.getByLabelText(`${visitation} Place`), 'H');
      expect(servicePatches).toEqual([{ serviceTime: '2:00 PM' }, { visitationPlace: 'H' }]);
      expect(patches).toEqual([]);
    });

    it('saves a typed date in the Service display format', async () => {
      const { servicePatches } = setup();
      const date = screen.getByLabelText(`${service} Date`);
      await userEvent.type(date, '6/5/2026');
      await userEvent.tab();
      expect(servicePatches.at(-1)).toEqual({ serviceDate: 'June 5, 2026' });
      expect(date).toHaveValue('June 5, 2026');
    });

    it('shows the quiet note when the service date is before the date of passing', () => {
      setup({ serviceDate: 'May 1, 2026', dateOfPassing: 'June 1, 2026' });
      expect(screen.getByLabelText(`${service} Date`)).toHaveAccessibleDescription(
        new RegExp(serviceCopy.beforePassing.slice(0, 20)),
      );
    });

    it('a picked service place also writes the address', async () => {
      const client: PlacesClient = {
        suggest: vi.fn<PlacesClient['suggest']>().mockResolvedValue([
          { id: 'a', text: 'Oak Funeral Home, 1 Main St', mainText: 'Oak Funeral Home', secondaryText: '1 Main St' },
        ]),
        newToken: () => ({}),
        details: vi.fn<PlacesClient['details']>().mockResolvedValue({
          name: 'Oak Funeral Home',
          address: '1 Main St, Springfield, MO 65801',
        }),
      };
      const servicePatches: ServiceSharedPatch[] = [];
      function Harness() {
        const [values, setValues] = useState<Values>({});
        return (
          <PlacesProvider value={{ enabled: true, load: () => Promise.resolve(client) }}>
            <ObituaryLifeFields
              values={values}
              onChange={() => undefined}
              onServiceChange={(patch) => {
                servicePatches.push(patch);
                setValues((v) => ({ ...v, ...patch }));
              }}
              onPersonChange={() => undefined}
            />
          </PlacesProvider>
        );
      }
      render(<Harness />);
      await userEvent.click(screen.getByRole('button', { name: copy.groupEventsHeading }));
      const place = screen.getByRole('combobox', { name: `${service} Place` });
      await userEvent.type(place, 'oak');
      await userEvent.click(await screen.findByRole('option', { name: /Oak Funeral Home/ }));
      await waitFor(() =>
        expect(servicePatches).toContainEqual({
          servicePlace: 'Oak Funeral Home',
          serviceAddress: '1 Main St, Springfield, MO 65801',
        }),
      );
    });

    it('gives the group the hint as its description', async () => {
      setup();
      await userEvent.click(screen.getByRole('button', { name: copy.groupEventsHeading }));
      expect(screen.getByRole('group', { name: copy.groupEventsHeading })).toHaveAccessibleDescription(
        copy.serviceSharedHint,
      );
    });
  });

  it('holds no hard-coded copy', () => {
    const source = readFileSync(join(import.meta.dirname, 'ObituaryLifeFields.tsx'), 'utf8');
    expect(findHardCodedCopy(source, 'cmsObituary')).toEqual([]);
  });
});
