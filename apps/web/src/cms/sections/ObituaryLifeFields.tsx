import { useId, useRef, useState, type ReactNode } from 'react';
import { screenCopy } from '@griever/copy';
import { AccordionSection } from '../AccordionSection';
import { ANY_PLACE_TYPES, BURIAL_PLACE_TYPES, SERVICE_PLACE_TYPES } from '../../lib/places/placesClient';
import { DateInput, todayISO } from '../../lib/DateField';
import { dateNoteProps as noteProps } from '../../lib/dateNoteProps';
import { PlaceInput } from '../../lib/places/PlaceInput';
import { EventFields } from './EventFields';
import {
  FLOW_DETAIL_MAX_LENGTH,
  FUNERAL_HOME_PLACE_TYPES,
  WORSHIP_PLACE_TYPES,
  ageFrom,
  dateNote,
  splitPersonName,
  type SectionFields,
  type ServiceEventFields,
  type SessionDetails,
} from '@griever/shared';

const copy = screenCopy('cmsObituary');
// The shared controls use Service's own labels, so the same value has the same name on both pages.
const serviceCopy = screenCopy('cmsService');
const personCopy = screenCopy('cmsPerson');

type TextKey =
  | 'obituaryGivenName'
  | 'obituaryMiddleName'
  | 'obituarySurname'
  | 'obituaryAge'
  | 'obituaryCity'
  | 'obituaryState'
  | 'obituaryDeathPlace'
  | 'obituaryFuneralHome'
  | 'obituaryChurch'
  | 'obituaryCemeteryLocation'
  | 'obituaryBirthPlace'
  | 'obituaryMotherName'
  | 'obituaryFatherName'
  | 'obituaryHighSchool'
  | 'obituaryGradYear'
  | 'obituaryDegree'
  | 'obituaryCollege'
  | 'obituaryJobTitle'
  | 'obituaryCompany'
  | 'obituaryJobYears'
  | 'obituaryHobbies'
  | 'obituaryAwards'
  | 'obituaryOrganizations';

/** The keys this component writes to. */
export type ObituaryLifeKey = TextKey | 'obituaryPronoun';

export type ObituaryLifePatch = Partial<Record<ObituaryLifeKey, string>>;

/** The Service fields this component also writes. They are the same saved values as on Service. */
export type ServiceSharedKey =
  | 'burialPlace'
  | 'burialPrivate'
  | 'serviceOfficiant'
  | 'visitationPlace'
  | 'visitationDate'
  | 'visitationTime'
  | 'servicePlace'
  | 'serviceTime'
  | 'serviceDate'
  | 'serviceAddress';

type ServiceSharedFields = ServiceEventFields & SectionFields & SessionDetails;

export type ServiceSharedPatch = Partial<Pick<ServiceSharedFields, ServiceSharedKey>>;

/** The Person fields this component also writes. They are the same saved values as on The person. */
export type PersonSharedKey = 'birthDate' | 'dateOfPassing';

export type PersonSharedPatch = Partial<Pick<SectionFields & SessionDetails, PersonSharedKey>>;

/** The life keys, the Service and Person shared keys, and the name, which is only read. */
export type ObituaryLifeValues = Partial<Pick<SectionFields, ObituaryLifeKey | 'birthDate'>> &
  Partial<Pick<SessionDetails, 'personName' | 'dateOfPassing'>> &
  Partial<Pick<ServiceSharedFields, ServiceSharedKey>>;

interface Props {
  values: ObituaryLifeValues;
  /** Gets only the field that changed (a name part typed over the shown person name gives all three parts). */
  onChange: (patch: ObituaryLifePatch) => void;
  /** Gets only the Service field that changed. It writes the same value Service shows. */
  onServiceChange: (patch: ServiceSharedPatch) => void;
  /** Gets only the date that changed. It writes the same value The person shows. */
  onPersonChange: (patch: PersonSharedPatch) => void;
}

interface FieldSpec {
  key: TextKey;
  label: string;
  /** Year and number fields get the numeric keypad but still accept text. */
  numeric?: boolean;
  /** Takes both columns from the md breakpoint. Without it the field takes one. */
  full?: boolean;
  /** Set: the field suggests these place types. A pick saves the place name only. */
  placeTypes?: readonly string[];
}

const nameFields: FieldSpec[] = [
  { key: 'obituaryGivenName', label: copy.givenNameLabel },
  { key: 'obituaryMiddleName', label: copy.middleNameLabel },
  { key: 'obituarySurname', label: copy.surnameLabel },
];

// Listed row by row: the DOM order is the visual order, so Tab follows what the user sees.
const lifeFields: FieldSpec[] = [
  { key: 'obituaryAge', label: copy.ageLabel, numeric: true },
  { key: 'obituaryBirthPlace', label: copy.birthPlaceLabel },
  { key: 'obituaryCity', label: copy.cityLabel },
  { key: 'obituaryState', label: copy.stateLabel },
  { key: 'obituaryDeathPlace', label: copy.deathPlaceLabel, full: true },
  { key: 'obituaryHighSchool', label: copy.highSchoolLabel },
  { key: 'obituaryGradYear', label: copy.graduationYearLabel, numeric: true },
  { key: 'obituaryCollege', label: copy.collegeLabel },
  { key: 'obituaryDegree', label: copy.degreeLabel },
  { key: 'obituaryJobTitle', label: copy.jobTitleLabel },
  { key: 'obituaryCompany', label: copy.companyLabel },
  { key: 'obituaryJobYears', label: copy.yearsLabel, numeric: true },
  { key: 'obituaryHobbies', label: copy.hobbiesLabel, full: true },
  { key: 'obituaryAwards', label: copy.awardsLabel, full: true },
  { key: 'obituaryOrganizations', label: copy.charitiesLabel, full: true },
];

const familyFields: FieldSpec[] = [
  { key: 'obituaryMotherName', label: copy.motherNameLabel },
  { key: 'obituaryFatherName', label: copy.fatherNameLabel },
];

const funeralFields: FieldSpec[] = [
  { key: 'obituaryFuneralHome', label: copy.funeralHomeLabel, placeTypes: FUNERAL_HOME_PLACE_TYPES },
  { key: 'obituaryChurch', label: copy.churchLabel, placeTypes: WORSHIP_PLACE_TYPES },
];

const cemeteryLocationField: FieldSpec = { key: 'obituaryCemeteryLocation', label: copy.cemeteryLabel, full: true };

type GroupKey = 'name' | 'life' | 'family' | 'events' | 'service';

const pronounChoices = [
  { value: '', label: copy.pronounNone },
  { value: 'he', label: copy.pronounHe },
  { value: 'she', label: copy.pronounShe },
  { value: 'they', label: copy.pronounThey },
];

/** The name parts, age, places, school, work, interests and pronoun of the obituary. Controlled; it does not save. */
export function ObituaryLifeFields({ values, onChange, onServiceChange, onPersonChange }: Props) {
  const id = useId();
  const [ageFocused, setAgeFocused] = useState(false);
  // The address the last cemetery pick wrote, so a later pick may replace it but never a typed one.
  const pickedCemeteryLocation = useRef<string | null>(null);
  const mayFillCemeteryLocation = () => {
    const current = values.obituaryCemeteryLocation ?? '';
    return current === '' || current === pickedCemeteryLocation.current;
  };
  // Open on load: the name only. Not remembered across loads.
  const [open, setOpen] = useState<Set<GroupKey>>(() => new Set<GroupKey>(['name']));
  function toggle(key: GroupKey) {
    setOpen((before) => {
      const next = new Set(before);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }
  const personName = values.personName?.trim() ?? '';
  const nameKeys = ['obituaryGivenName', 'obituaryMiddleName', 'obituarySurname'] as const;
  // Only while no part was ever saved (all undefined). A cleared part is '' and stays cleared.
  const derivedParts = nameKeys.every((k) => values[k] === undefined) && personName !== '' ? splitPersonName(personName) : null;
  const derivedName: Record<string, string> = derivedParts
    ? {
        obituaryGivenName: derivedParts.given,
        obituaryMiddleName: derivedParts.middle,
        obituarySurname: derivedParts.surname,
      }
    : {};
  const nameHintId = `${id}-name-derived-hint`;
  const derivedAge = ageFrom(values.birthDate ?? '', values.dateOfPassing ?? '');

  function renderField(spec: FieldSpec) {
    const isAge = spec.key === 'obituaryAge';
    const isNamePart = (nameKeys as readonly string[]).includes(spec.key);
    const typed = derivedParts && isNamePart ? derivedName[spec.key] : (values[spec.key] ?? '');
    const hintId = `${id}-${spec.key}-hint`;
    // While the age has focus it shows only what was typed; otherwise the worked-out age fills an empty field.
    const showsDerived = isAge && typed === '' && !ageFocused && derivedAge !== '';
    if (spec.placeTypes) {
      const fieldId = `${id}-${spec.key}`;
      const labelId = `${fieldId}-label`;
      const max = FLOW_DETAIL_MAX_LENGTH[spec.key];
      return (
        <div className={spec.full ? 'gg-field md:col-span-2' : 'gg-field'} key={spec.key}>
          <label id={labelId} htmlFor={fieldId}>
            {spec.label}
          </label>
          <PlaceInput
            id={fieldId}
            labelledBy={labelId}
            maxLength={max}
            types={spec.placeTypes}
            // Only the name is saved, so the paid details call is not needed.
            wantsDetails={() => false}
            onPick={(pick) => {
              // Cut to the saved length, as the server would, so a long pick is not lost on save.
              onChange({ [spec.key]: pick.mainText.slice(0, max) });
            }}
            value={typed}
            onChange={(text) => onChange({ [spec.key]: text })}
          />
        </div>
      );
    }
    return (
      <div className={spec.full ? 'gg-field md:col-span-2' : 'gg-field'} key={spec.key}>
        <label htmlFor={`${id}-${spec.key}`}>{spec.label}</label>
        {showsDerived && (
          <p id={hintId} className="gg-hint">
            {copy.ageHint}
          </p>
        )}
        <input
          id={`${id}-${spec.key}`}
          type="text"
          className="gg-input"
          autoComplete="off"
          inputMode={spec.numeric ? 'numeric' : undefined}
          maxLength={FLOW_DETAIL_MAX_LENGTH[spec.key]}
          aria-describedby={showsDerived ? hintId : derivedParts && isNamePart ? nameHintId : undefined}
          value={showsDerived ? derivedAge : typed}
          onFocus={isAge ? () => setAgeFocused(true) : undefined}
          onBlur={isAge ? () => setAgeFocused(false) : undefined}
          onChange={(e) =>
            onChange(derivedParts ? { ...derivedName, [spec.key]: e.target.value } : { [spec.key]: e.target.value })
          }
        />
      </div>
    );
  }

  function renderServiceText(key: 'serviceOfficiant', label: string, hintId: string) {
    return (
      <div className="gg-field" key={key}>
        <label htmlFor={`${id}-${key}`}>{label}</label>
        <input
          id={`${id}-${key}`}
          type="text"
          className="gg-input"
          autoComplete="off"
          maxLength={FLOW_DETAIL_MAX_LENGTH[key]}
          aria-describedby={hintId}
          value={values[key] ?? ''}
          onChange={(e) => onServiceChange({ [key]: e.target.value })}
        />
      </div>
    );
  }

  function renderCemetery(label: string, hintId: string) {
    const fieldId = `${id}-burialPlace`;
    const labelId = `${fieldId}-label`;
    return (
      <div className="gg-field" key="burialPlace">
        <label id={labelId} htmlFor={fieldId}>
          {label}
        </label>
        <PlaceInput
          id={fieldId}
          labelledBy={labelId}
          describedBy={hintId}
          maxLength={FLOW_DETAIL_MAX_LENGTH.burialPlace}
          fillMessage={copy.cemeteryLocationFilled}
          types={BURIAL_PLACE_TYPES}
          wantsDetails={(pick) => Boolean(pick.secondaryText && mayFillCemeteryLocation())}
          onPick={(pick, details) => {
            // The full address from the place itself; the prediction's short line if that failed.
            // Cut to the saved length, as the server would, so a long pick is not lost on save.
            const cut = (text: string, max: number) => text.slice(0, max);
            const placeMax = FLOW_DETAIL_MAX_LENGTH.burialPlace;
            const name = cut(details?.name || pick.mainText, placeMax);
            const address = cut(details?.address || pick.secondaryText, FLOW_DETAIL_MAX_LENGTH.obituaryCemeteryLocation);
            if (!address) {
              onServiceChange({ burialPlace: cut(pick.text, placeMax) });
              return false;
            }
            if (!mayFillCemeteryLocation()) {
              onServiceChange({ burialPlace: name });
              return false;
            }
            pickedCemeteryLocation.current = address;
            onServiceChange({ burialPlace: name });
            onChange({ obituaryCemeteryLocation: address });
            return true;
          }}
          value={values.burialPlace ?? ''}
          onChange={(burialPlace) => onServiceChange({ burialPlace })}
        />
      </div>
    );
  }

  function renderGroup(
    key: GroupKey,
    heading: string,
    fields: FieldSpec[],
    { lead, tail }: { lead?: ReactNode; tail?: ReactNode } = {},
  ) {
    const headingId = `${id}-${key}-heading`;
    return (
      <AccordionSection
        title={heading}
        level={2}
        headingId={headingId}
        open={open.has(key)}
        panelId={`${id}-${key}-panel`}
        onToggle={() => toggle(key)}
      >
        <div role="group" aria-labelledby={headingId} className="flex flex-col gap-4">
          {lead}
          <div className="grid grid-cols-1 items-end gap-4 md:grid-cols-2">
            {fields.map(renderField)}
            {tail}
          </div>
        </div>
      </AccordionSection>
    );
  }

  const personHintId = `${id}-person-shared-hint`;
  const birthNote = dateNote(values.birthDate, { field: 'birth', dateOfPassing: values.dateOfPassing });
  const passingNote = dateNote(values.dateOfPassing, { field: 'passing' });
  // The same labels, props and notes as on The person, so values and date formats match.
  const personDates = (
    <div className="flex flex-col gap-4 md:col-span-2" data-group="person-shared">
      <p id={personHintId} className="gg-hint">
        {copy.personSharedHint}
      </p>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="gg-field">
          <label htmlFor={`${id}-birthDate`}>{`${personCopy.dateOfBirthLabel} ${personCopy.optional}`}</label>
          <DateInput
            id={`${id}-birthDate`}
            value={values.birthDate ?? ''}
            max={todayISO()}
            visibleHelp
            describedBy={personHintId}
            {...noteProps(birthNote)}
            onChange={(birthDate) => onPersonChange({ birthDate })}
          />
        </div>
        <div className="gg-field">
          <label htmlFor={`${id}-dateOfPassing`}>{`${personCopy.dateOfPassingLabel} ${personCopy.optional}`}</label>
          <DateInput
            id={`${id}-dateOfPassing`}
            value={values.dateOfPassing ?? ''}
            max={todayISO()}
            visibleHelp
            describedBy={personHintId}
            {...noteProps(passingNote)}
            onChange={(dateOfPassing) => onPersonChange({ dateOfPassing })}
          />
        </div>
      </div>
    </div>
  );

  const pronoun = (
    <div className="gg-field">
      <label htmlFor={`${id}-pronoun`}>{copy.pronounLabel}</label>
      <select
        id={`${id}-pronoun`}
        className="gg-input"
        value={values.obituaryPronoun ?? ''}
        onChange={(e) => onChange({ obituaryPronoun: e.target.value })}
      >
        {pronounChoices.map((choice) => (
          <option key={choice.value} value={choice.value}>
            {choice.label}
          </option>
        ))}
      </select>
    </div>
  );

  const burialPrivate = values.burialPrivate === true;
  const sharedHintId = `${id}-service-shared-hint`;
  // Funeral home and church are Obituary-only. The block holds the three values Service shares.
  const serviceTail = (
    <>
      <div className="flex flex-col gap-4 md:col-span-2" data-group="service-shared">
        <p id={sharedHintId} className="gg-hint">
          {copy.serviceSharedHint}
        </p>
        {renderServiceText('serviceOfficiant', serviceCopy.eventOfficiant, sharedHintId)}
        <label className="flex min-h-[44px] cursor-pointer items-center gap-3">
          <input
            type="checkbox"
            className="m-0 h-5 w-5"
            checked={burialPrivate}
            aria-describedby={sharedHintId}
            onChange={(e) => onServiceChange({ burialPrivate: e.target.checked })}
          />
          {serviceCopy.eventPrivateFamily}
        </label>
        {!burialPrivate && renderCemetery(serviceCopy.eventCemetery, sharedHintId)}
      </div>
      {!burialPrivate && renderField(cemeteryLocationField)}
    </>
  );

  const eventsHintId = `${id}-events-hint`;
  // The same fields and props as on Service, so values and date formats match.
  const events = (
    <AccordionSection
      title={copy.groupEventsHeading}
      level={2}
      headingId={`${id}-events-heading`}
      open={open.has('events')}
      panelId={`${id}-events-panel`}
      onToggle={() => toggle('events')}
    >
      <div
        role="group"
        aria-labelledby={`${id}-events-heading`}
        aria-describedby={eventsHintId}
        className="flex flex-col gap-6"
        data-group="events-shared"
      >
        <p id={eventsHintId} className="gg-hint">
          {copy.serviceSharedHint}
        </p>
        <EventFields
          legend={serviceCopy.eventFuneral}
          keys={{ date: 'serviceDate', time: 'serviceTime', place: 'servicePlace' }}
          values={values}
          onChange={onServiceChange}
          dateOfPassing={values.dateOfPassing}
          placeTypes={SERVICE_PLACE_TYPES}
          addressKey="serviceAddress"
        />
        <EventFields
          legend={serviceCopy.eventVisitation}
          keys={{ date: 'visitationDate', time: 'visitationTime', place: 'visitationPlace' }}
          values={values}
          onChange={onServiceChange}
          dateOfPassing={values.dateOfPassing}
          placeTypes={ANY_PLACE_TYPES}
        />
      </div>
    </AccordionSection>
  );

  return (
    <>
      {renderGroup('name', copy.groupNameHeading, nameFields, {
        lead: derivedParts && (
          <p id={nameHintId} className="gg-hint">
            {copy.nameFromPersonHint}
          </p>
        ),
        tail: (
          <>
            {pronoun}
            {personDates}
          </>
        ),
      })}
      {renderGroup('life', copy.groupLifeHeading, lifeFields)}
      {renderGroup('family', copy.groupFamilyHeading, familyFields)}
      {events}
      {renderGroup('service', copy.groupServiceHeading, funeralFields, { tail: serviceTail })}
    </>
  );
}
