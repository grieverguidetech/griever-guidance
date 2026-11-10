import { useId, useState, type ReactNode } from 'react';
import { screenCopy } from '@griever/copy';
import { AccordionSection } from '../AccordionSection';
import {
  FLOW_DETAIL_MAX_LENGTH,
  ageFrom,
  splitPersonName,
  type SectionFields,
  type ServiceEventFields,
  type SessionDetails,
} from '@griever/shared';

const copy = screenCopy('cmsObituary');
// The shared controls use Service's own labels, so the same value has the same name on both pages.
const serviceCopy = screenCopy('cmsService');

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
export type ServiceSharedKey = 'burialPlace' | 'burialPrivate' | 'serviceOfficiant';

export type ServiceSharedPatch = Partial<Pick<ServiceEventFields, ServiceSharedKey>>;

/** The life keys, plus the name and dates, which are only read. */
export type ObituaryLifeValues = Partial<Pick<SectionFields, ObituaryLifeKey | 'birthDate'>> &
  Partial<Pick<SessionDetails, 'personName' | 'dateOfPassing'>> &
  Partial<Pick<ServiceEventFields, ServiceSharedKey>>;

interface Props {
  values: ObituaryLifeValues;
  /** Gets only the field that changed (the name button gives three keys at once). */
  onChange: (patch: ObituaryLifePatch) => void;
  /** Gets only the Service field that changed. It writes the same value Service shows. */
  onServiceChange: (patch: ServiceSharedPatch) => void;
}

interface FieldSpec {
  key: TextKey;
  label: string;
  /** Year and number fields get the numeric keypad but still accept text. */
  numeric?: boolean;
  /** Takes both columns from the md breakpoint. Without it the field takes one. */
  full?: boolean;
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
  { key: 'obituaryFuneralHome', label: copy.funeralHomeLabel },
  { key: 'obituaryChurch', label: copy.churchLabel },
];

const cemeteryLocationField: FieldSpec = { key: 'obituaryCemeteryLocation', label: copy.cemeteryLabel, full: true };

type GroupKey = 'name' | 'life' | 'family' | 'service';

const pronounChoices = [
  { value: '', label: copy.pronounNone },
  { value: 'he', label: copy.pronounHe },
  { value: 'she', label: copy.pronounShe },
  { value: 'they', label: copy.pronounThey },
];

/** The name parts, age, places, school, work, interests and pronoun of the obituary. Controlled; it does not save. */
export function ObituaryLifeFields({ values, onChange, onServiceChange }: Props) {
  const id = useId();
  const [ageFocused, setAgeFocused] = useState(false);
  const [nameFilled, setNameFilled] = useState(false);
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
  const derivedAge = ageFrom(values.birthDate ?? '', values.dateOfPassing ?? '');

  function renderField(spec: FieldSpec) {
    const isAge = spec.key === 'obituaryAge';
    const typed = values[spec.key] ?? '';
    const hintId = `${id}-${spec.key}-hint`;
    // While the age has focus it shows only what was typed; otherwise the worked-out age fills an empty field.
    const showsDerived = isAge && typed === '' && !ageFocused && derivedAge !== '';
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
          aria-describedby={showsDerived ? hintId : undefined}
          value={showsDerived ? derivedAge : typed}
          onFocus={isAge ? () => setAgeFocused(true) : undefined}
          onBlur={isAge ? () => setAgeFocused(false) : undefined}
          onChange={(e) => onChange({ [spec.key]: e.target.value })}
        />
      </div>
    );
  }

  function renderServiceText(key: 'burialPlace' | 'serviceOfficiant', label: string, hintId: string) {
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

  function renderGroup(
    key: GroupKey,
    heading: string,
    fields: FieldSpec[],
    lead?: ReactNode,
    tail?: ReactNode,
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

  const useName = personName !== '' && (
    <button
      type="button"
      className="gg-link-button"
      onClick={() => {
        const { given, middle, surname } = splitPersonName(personName);
        onChange({ obituaryGivenName: given, obituaryMiddleName: middle, obituarySurname: surname });
        setNameFilled(true);
      }}
    >
      {copy.useNameFromPersonLabel}
    </button>
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
        {!burialPrivate && renderServiceText('burialPlace', serviceCopy.eventCemetery, sharedHintId)}
      </div>
      {!burialPrivate && renderField(cemeteryLocationField)}
    </>
  );

  return (
    <>
      <p role="status" className="sr-only">
        {nameFilled ? copy.nameFilled : ''}
      </p>
      {renderGroup('name', copy.groupNameHeading, nameFields, useName, pronoun)}
      {renderGroup('life', copy.groupLifeHeading, lifeFields)}
      {renderGroup('family', copy.groupFamilyHeading, familyFields)}
      {renderGroup('service', copy.groupServiceHeading, funeralFields, undefined, serviceTail)}
    </>
  );
}
