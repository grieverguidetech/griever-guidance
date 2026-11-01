import { useId, useState } from 'react';
import type { FormEvent } from 'react';
import { screenCopy } from '@griever/copy';
import { BIRTH_YEAR_MIN, checkAddress, isValidBirthDate, isValidNamePart, normalizeNamePart, NAME_PART_MAX_LENGTH } from '@griever/shared';
import type { Address, AddressField } from '@griever/shared';
import { DateInput, dateToISO, isoToDate, todayISO } from '../lib/DateField';

const copy = screenCopy('account');

// A date of birth goes past the default 2000-2100 range. Any four-digit year parses; isValidBirthDate then says whether it is allowed.
const BIRTH_YEARS = { minYear: 1000, maxYear: 9999 };

/** What the details form saves. Matches useAccount.updateDetails. */
export interface PersonalDetails {
  firstName: string | null;
  lastName: string | null;
  /** yyyy-mm-dd */
  birthDate: string | null;
  address: Address | null;
}

export type SaveDetailsResult = { ok: true } | { ok: false; invalid: boolean };

type FieldKey = 'firstName' | 'lastName' | 'birthDate' | AddressField;

/** What the person typed, field by field. The date is the pretty text the DateInput holds. */
interface FormValues {
  firstName: string;
  lastName: string;
  date: string;
  line1: string;
  line2: string;
  city: string;
  state: string;
  zip: string;
}

export interface CheckedDetails {
  details: PersonalDetails;
  errors: Partial<Record<FieldKey, string>>;
}

function namePartError(text: string): string | undefined {
  if ([...text].length > NAME_PART_MAX_LENGTH) {
    return copy.fieldTooLong;
  }
  return isValidNamePart(text) ? undefined : copy.fieldBadChars;
}

/** The calm message for one address field the shared check refused. */
function addressMessage(field: AddressField, problem: string): string {
  if (field === 'state') {
    return problem === 'required' ? copy.stateRequired : copy.stateInvalid;
  }
  if (field === 'zip') {
    return problem === 'required' ? copy.zipRequired : copy.zipInvalid;
  }
  if (problem === 'required') {
    return field === 'city' ? copy.cityRequired : copy.addressLine1Required;
  }
  return problem === 'tooLong' ? copy.fieldTooLong : copy.fieldBadChars;
}

/**
 * Checks every value the way the server does. Returns what to save and the calm message for each field that is wrong.
 * The first name is always required: it is the name messages are signed with.
 */
export function checkDetails(values: FormValues): CheckedDetails {
  const errors: Partial<Record<FieldKey, string>> = {};
  const firstName = normalizeNamePart(values.firstName) as string | null;
  const lastName = normalizeNamePart(values.lastName) as string | null;
  if (firstName === null) {
    errors.firstName = copy.firstNameRequired;
  } else if (firstName !== null) {
    errors.firstName = namePartError(firstName);
  }
  if (lastName !== null) {
    errors.lastName = namePartError(lastName);
  }

  let birthDate: string | null = null;
  if (values.date.trim() !== '') {
    const iso = dateToISO(values.date, BIRTH_YEARS);
    if (!iso) {
      errors.birthDate = copy.birthDateIncomplete;
    } else if (!isValidBirthDate(iso)) {
      errors.birthDate = copy.birthDateOutOfRange;
    } else {
      birthDate = iso;
    }
  }

  let address: Address | null = null;
  const checked = checkAddress({ line1: values.line1, line2: values.line2, city: values.city, state: values.state, zip: values.zip });
  if (checked.ok) {
    address = checked.address;
  } else {
    for (const [field, problem] of Object.entries(checked.errors) as [AddressField, string][]) {
      errors[field] = addressMessage(field, problem);
    }
  }

  for (const key of Object.keys(errors) as FieldKey[]) {
    if (errors[key] === undefined) {
      delete errors[key];
    }
  }
  return { details: { firstName, lastName, birthDate, address }, errors };
}

interface TextFieldProps {
  id: string;
  label: string;
  value: string;
  onChange: (next: string) => void;
  autoComplete: string;
  error?: string;
  hint?: string;
  maxLength?: number;
  autoCapitalize?: string;
}

/** A visible label, the input, an optional hint, and an alert when the value is wrong. */
function TextField({ id, label, value, onChange, autoComplete, error, hint, maxLength, autoCapitalize = 'words' }: TextFieldProps) {
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const describedBy = [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(' ');
  return (
    <>
      <label htmlFor={id} className="font-semibold">
        {label}
      </label>
      <input
        id={id}
        type="text"
        className="gg-input"
        autoComplete={autoComplete}
        autoCapitalize={autoCapitalize}
        maxLength={maxLength}
        value={value}
        aria-describedby={describedBy || undefined}
        aria-invalid={error ? true : undefined}
        onChange={(event) => onChange(event.target.value)}
      />
      {hint ? (
        <p id={hintId} className="gg-hint m-0 text-[13px]">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} role="alert" className="m-0 text-[13px] font-semibold">
          {error}
        </p>
      ) : null}
    </>
  );
}

interface DetailsFormProps {
  /** The name prompt: only first and last name; date of birth and address are sent as they are. */
  namesOnly?: boolean;
  senderName: string | null;
  firstName: string | null;
  lastName: string | null;
  birthDate: string | null;
  address: Address | null;
  /** The identity hook's own calm copy for a failure that is not about a value. */
  error: string | null;
  onSave: (details: PersonalDetails) => Promise<SaveDetailsResult>;
}

/** "Personal details": first and last name, date of birth and address, on one Save details button. */
export function PersonalDetailsForm({ namesOnly, senderName, firstName, lastName, birthDate, address, error, onSave }: DetailsFormProps) {
  const id = useId();
  // Until the person types, show what is known, including values that load late.
  const [typed, setTyped] = useState<Partial<FormValues>>({});
  const [pending, setPending] = useState(false);
  const [saved, setSaved] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<FieldKey, string>>>({});
  const [serverInvalid, setServerInvalid] = useState(false);
  const [failed, setFailed] = useState(false);

  // An account saved before first and last name existed has only the name messages are signed with.
  const noNames = !firstName && !lastName;
  const known: FormValues = {
    firstName: firstName ?? (noNames ? (senderName ?? '') : ''),
    lastName: lastName ?? '',
    date: birthDate ? isoToDate(birthDate) : '',
    line1: address?.line1 ?? '',
    line2: address?.line2 ?? '',
    city: address?.city ?? '',
    state: address?.state ?? '',
    zip: address?.zip ?? '',
  };
  const values: FormValues = { ...known, ...typed };

  function change(field: keyof FormValues, key: FieldKey, next: string) {
    setTyped((current) => ({ ...current, [field]: next }));
    setErrors((current) => ({ ...current, [key]: undefined }));
    setSaved(false);
    setServerInvalid(false);
    setFailed(false);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (pending) {
      return;
    }
    const checked = checkDetails(values);
    setErrors(checked.errors);
    setServerInvalid(false);
    setFailed(false);
    if (Object.keys(checked.errors).length > 0) {
      return;
    }
    // The name prompt changes the names only: the rest goes back as it was.
    const details = namesOnly ? { ...checked.details, birthDate, address } : checked.details;
    setPending(true);
    setSaved(false);
    try {
      const result = await onSave(details);
      if (result.ok) {
        setTyped({});
        setSaved(true);
      } else if (result.invalid) {
        setServerInvalid(true);
      } else {
        setFailed(true);
      }
    } finally {
      setPending(false);
    }
  }

  let message = '';
  if (serverInvalid) {
    message = copy.detailsInvalid;
  } else if (failed && error) {
    message = error;
  } else if (saved) {
    message = copy.detailsSaved;
  }
  const isError = Boolean(serverInvalid || (failed && error));

  return (
    <form className="flex flex-col gap-3" onSubmit={(event) => void submit(event)} noValidate>
      <h3 className="text-[16px] m-0">{copy.personalHeading}</h3>
      <p className="gg-hint m-0 text-[13px]">{namesOnly ? copy.askNamesIntro : copy.personalHint}</p>
      <TextField
        id={`${id}-first`}
        label={copy.firstNameLabel}
        value={values.firstName}
        autoComplete="given-name"
        error={errors.firstName}
        onChange={(next) => change('firstName', 'firstName', next)}
      />
      <TextField
        id={`${id}-last`}
        label={copy.lastNameLabel}
        value={values.lastName}
        autoComplete="family-name"
        error={errors.lastName}
        onChange={(next) => change('lastName', 'lastName', next)}
      />
      {namesOnly ? null : (
        <>
          <label htmlFor={`${id}-dob`} className="font-semibold">
            {copy.birthDateLabel}
          </label>
          <DateInput
            id={`${id}-dob`}
            value={values.date}
            min={`${BIRTH_YEAR_MIN}-01-01`}
            max={todayISO()}
            describedBy={`${id}-dob-hint`}
            visibleHelp
            years={BIRTH_YEARS}
            error={errors.birthDate}
            onChange={(next) => change('date', 'birthDate', next)}
          />
          <p id={`${id}-dob-hint`} className="gg-hint m-0 text-[13px]">
            {copy.birthDateHint}
          </p>
          <fieldset className="m-0 flex min-w-0 flex-col gap-3 border-0 p-0" aria-describedby={`${id}-address-hint`}>
            <legend className="mb-3 p-0 font-semibold">{copy.addressHeading}</legend>
            <p id={`${id}-address-hint`} className="gg-hint m-0 text-[13px]">
              {copy.addressHint}
            </p>
            <TextField
              id={`${id}-line1`}
              label={copy.addressLine1Label}
              value={values.line1}
              autoComplete="address-line1"
              error={errors.line1}
              onChange={(next) => change('line1', 'line1', next)}
            />
            <TextField
              id={`${id}-line2`}
              label={copy.addressLine2Label}
              value={values.line2}
              autoComplete="address-line2"
              error={errors.line2}
              onChange={(next) => change('line2', 'line2', next)}
            />
            <TextField
              id={`${id}-city`}
              label={copy.cityLabel}
              value={values.city}
              autoComplete="address-level2"
              error={errors.city}
              onChange={(next) => change('city', 'city', next)}
            />
            {/* A two-letter text box is simpler and easier to use than a 50-item list, and works the same with a keyboard or a screen reader. */}
            <TextField
              id={`${id}-state`}
              label={copy.stateLabel}
              value={values.state}
              autoComplete="address-level1"
              autoCapitalize="characters"
              maxLength={2}
              hint={copy.stateHint}
              error={errors.state}
              onChange={(next) => change('state', 'state', next.toUpperCase())}
            />
            <TextField
              id={`${id}-zip`}
              label={copy.zipLabel}
              value={values.zip}
              autoComplete="postal-code"
              autoCapitalize="off"
              error={errors.zip}
              onChange={(next) => change('zip', 'zip', next)}
            />
          </fieldset>
        </>
      )}
      <p role="status" aria-live="polite" className={`m-0 text-[13px] ${isError ? 'font-semibold' : 'gg-hint'}`}>
        {message}
      </p>
      <div className="flex flex-wrap gap-2">
        <button type="submit" className="gg-btn gg-btn-primary" aria-disabled={pending}>
          {pending ? copy.saving : copy.detailsSave}
        </button>
      </div>
    </form>
  );
}

