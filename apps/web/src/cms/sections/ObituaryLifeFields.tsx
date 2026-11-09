import { useId, type ReactNode } from 'react';
import { screenCopy } from '@griever/copy';
import {
  FLOW_DETAIL_MAX_LENGTH,
  ageFrom,
  splitPersonName,
  type SectionFields,
  type SessionDetails,
} from '@griever/shared';

const copy = screenCopy('cmsObituary');

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

/** The life keys, plus the name and dates, which are only read. */
export type ObituaryLifeValues = Partial<Pick<SectionFields, ObituaryLifeKey | 'birthDate'>> &
  Partial<Pick<SessionDetails, 'personName' | 'dateOfPassing'>>;

interface Props {
  values: ObituaryLifeValues;
  /** Gets only the field that changed (the name button gives three keys at once). */
  onChange: (patch: ObituaryLifePatch) => void;
}

interface FieldSpec {
  key: TextKey;
  label: string;
  /** Year and number fields get the numeric keypad but still accept text. */
  numeric?: boolean;
}

const nameFields: FieldSpec[] = [
  { key: 'obituaryGivenName', label: copy.givenNameLabel },
  { key: 'obituaryMiddleName', label: copy.middleNameLabel },
  { key: 'obituarySurname', label: copy.surnameLabel },
];

const lifeFields: FieldSpec[] = [
  { key: 'obituaryAge', label: copy.ageLabel, numeric: true },
  { key: 'obituaryCity', label: copy.cityLabel },
  { key: 'obituaryState', label: copy.stateLabel },
  { key: 'obituaryBirthPlace', label: copy.birthPlaceLabel },
  { key: 'obituaryDeathPlace', label: copy.deathPlaceLabel },
  { key: 'obituaryHighSchool', label: copy.highSchoolLabel },
  { key: 'obituaryGradYear', label: copy.graduationYearLabel, numeric: true },
  { key: 'obituaryDegree', label: copy.degreeLabel },
  { key: 'obituaryCollege', label: copy.collegeLabel },
  { key: 'obituaryJobTitle', label: copy.jobTitleLabel },
  { key: 'obituaryCompany', label: copy.companyLabel },
  { key: 'obituaryJobYears', label: copy.yearsLabel, numeric: true },
  { key: 'obituaryHobbies', label: copy.hobbiesLabel },
  { key: 'obituaryAwards', label: copy.awardsLabel },
  { key: 'obituaryOrganizations', label: copy.charitiesLabel },
];

const familyFields: FieldSpec[] = [
  { key: 'obituaryMotherName', label: copy.motherNameLabel },
  { key: 'obituaryFatherName', label: copy.fatherNameLabel },
];

const serviceFields: FieldSpec[] = [
  { key: 'obituaryFuneralHome', label: copy.funeralHomeLabel },
  { key: 'obituaryChurch', label: copy.churchLabel },
  { key: 'obituaryCemeteryLocation', label: copy.cemeteryLabel },
];

const pronounChoices = [
  { value: '', label: copy.pronounNone },
  { value: 'he', label: copy.pronounHe },
  { value: 'she', label: copy.pronounShe },
  { value: 'they', label: copy.pronounThey },
];

/** The name parts, age, places, school, work, interests and pronoun of the obituary. Controlled; it does not save. */
export function ObituaryLifeFields({ values, onChange }: Props) {
  const id = useId();
  const personName = values.personName?.trim() ?? '';
  const derivedAge = ageFrom(values.birthDate ?? '', values.dateOfPassing ?? '');

  function renderField(spec: FieldSpec) {
    const isAge = spec.key === 'obituaryAge';
    const typed = values[spec.key] ?? '';
    const hintId = `${id}-${spec.key}-hint`;
    return (
      <div className="gg-field" key={spec.key}>
        <label htmlFor={`${id}-${spec.key}`}>{spec.label}</label>
        {isAge && (
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
          aria-describedby={isAge ? hintId : undefined}
          value={isAge && typed === '' ? derivedAge : typed}
          onChange={(e) => onChange({ [spec.key]: e.target.value })}
        />
      </div>
    );
  }

  function renderGroup(heading: string, fields: FieldSpec[], lead?: ReactNode, tail?: ReactNode) {
    return (
      <fieldset className="flex flex-col gap-4 border-0 p-0 m-0 min-w-0">
        <legend className="mb-2 p-0 font-semibold">{heading}</legend>
        {lead}
        {fields.map(renderField)}
        {tail}
      </fieldset>
    );
  }

  const useName = personName !== '' && (
    <button
      type="button"
      className="gg-link-button"
      onClick={() => {
        const { given, middle, surname } = splitPersonName(personName);
        onChange({ obituaryGivenName: given, obituaryMiddleName: middle, obituarySurname: surname });
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

  return (
    <>
      {renderGroup(copy.groupNameHeading, nameFields, useName, pronoun)}
      {renderGroup(copy.groupLifeHeading, lifeFields)}
      {renderGroup(copy.groupFamilyHeading, familyFields)}
      {renderGroup(copy.groupServiceHeading, serviceFields)}
    </>
  );
}
