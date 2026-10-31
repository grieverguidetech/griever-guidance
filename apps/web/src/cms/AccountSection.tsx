import { useEffect, useId, useRef, useState } from 'react';
import { CreditCard } from '@phosphor-icons/react/CreditCard';
import type { FormEvent, ReactNode } from 'react';
import { screenCopy } from '@griever/copy';
import { BIRTH_YEAR_MIN, FULL_NAME_MAX_LENGTH, isValidBirthDate, isValidFullName, normalizeFullName } from '@griever/shared';
import { DateInput, dateToISO, isoToDate, todayISO } from '../lib/DateField';
import { buildPlansText, downloadPlans } from '../lib/exportPlans';
import type { PlanPerson } from '../lib/exportPlans';
import { SettingsBody } from '../screens/Settings';
import { useNameForm } from '../screens/Profile';

const copy = screenCopy('account');

// A date of birth goes past the default 2000-2100 range. Any four-digit year parses; isValidBirthDate then says whether it is allowed.
const BIRTH_YEARS = { minYear: 1000, maxYear: 9999 };

interface ProfileProps {
  /** The account has no name yet: the name prompt, with its intro line. */
  asksName?: boolean;
  senderName: string | null;
  /** The identity hook's own calm copy, shown as-is. */
  error: string | null;
  /** "People helping you", when sharing is on. */
  peopleHelping?: ReactNode;
  /** Resolves true when saved. A false result keeps what was typed. */
  onSave: (name: string) => Promise<boolean>;
  onSignOut: () => void;
  /** The optional private details. Absent fields read as empty. */
  fullName?: string | null;
  birthDate?: string | null;
  /** Saves the details. When absent, the two fields are not shown. */
  onSaveDetails?: (details: { fullName: string | null; birthDate: string | null }) => Promise<{ ok: true } | { ok: false; invalid: boolean }>;
  /** The signed-in email, shown read-only. Absent until Clerk has loaded it. */
  email?: string | null;
  /** Opens Clerk's own account screen. Absent when Clerk is not ready, and the button is not shown. */
  onManageSignIn?: () => void;
  /** The Settings actions (remove a member, remove everything from this device), shown under the account content. */
  settings?: SettingsProps;
  /** The people this account can open (the People list). When given, the "Your plans" panel is shown and holds the device removal. */
  plans?: readonly PlanPerson[];
}

/**
 * The signed-in account content inside the CMS shell, as a settings page: Profile, Sign-in and security, Payments, People helping you, Sign out, Your plans (with the device removal), each its own panel with an h2. The "What you'll need" list is the shell's panel, not repeated here.
 * The shell owns the h1; there is no Back here.
 */
export function AccountSection({ asksName, senderName, error, peopleHelping, onSave, onSignOut, fullName, birthDate, onSaveDetails, email, onManageSignIn, settings, plans }: ProfileProps) {
  const id = useId();
  const [cardNote, setCardNote] = useState(false);

  // A second press clears the note and sets it again, so a screen reader says it again.
  function showCardNote() {
    setCardNote(false);
    setTimeout(() => setCardNote(true), 50);
  }
  // The hook's error is shared with the details form; show it on the name form only after its own save failed.
  const [nameFailed, setNameFailed] = useState(false);
  async function saveName(name: string) {
    setNameFailed(false);
    const ok = await onSave(name);
    setNameFailed(!ok);
    return ok;
  }
  const { value, pending, saved, nameError, changeName, submit } = useNameForm({ senderName, onSave: saveName });
  const shownError = nameFailed ? error : null;

  let message = '';
  if (nameError) {
    message = nameError;
  } else if (shownError) {
    message = shownError;
  } else if (saved) {
    message = copy.saved;
  }
  const isError = Boolean(nameError || shownError);

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    void submit();
  }

  return (
    <>
      <section className="gg-panel flex flex-col gap-3" aria-labelledby={`${id}-profile`}>
        <h2 id={`${id}-profile`} className="text-[16px] m-0">
          {copy.profileHeading}
        </h2>
        <form className="flex flex-col gap-3" onSubmit={onSubmit} noValidate>
          {asksName ? <p id={`${id}-intro`} className="gg-hint m-0">{copy.askIntro}</p> : null}
          <label htmlFor={`${id}-name`} className="font-semibold">
            {copy.nameLabel}
          </label>
          <input
            id={`${id}-name`}
            type="text"
            className="gg-input"
            autoComplete="name"
            autoCapitalize="words"
            value={value}
            aria-describedby={asksName ? `${id}-intro ${id}-status` : `${id}-status`}
            aria-invalid={isError ? true : undefined}
            onChange={(event) => changeName(event.target.value)}
          />
          <p id={`${id}-status`} role="status" aria-live="polite" className={`m-0 text-[13px] ${isError ? 'font-semibold' : 'gg-hint'}`}>
            {message}
          </p>
          <div className="flex flex-wrap gap-2">
            <button type="submit" className="gg-btn gg-btn-primary" aria-disabled={pending}>
              {pending ? copy.saving : copy.save}
            </button>
          </div>
        </form>
        {onSaveDetails ? (
          <DetailsForm fullName={fullName ?? null} birthDate={birthDate ?? null} error={error} onSave={onSaveDetails} />
        ) : null}
      </section>
      {email || onManageSignIn ? (
        <section className="gg-panel flex flex-col gap-3" aria-labelledby={`${id}-security`}>
          <h2 id={`${id}-security`} className="text-[16px] m-0">
            {copy.securityHeading}
          </h2>
          {email ? (
            <dl className="m-0 flex flex-col gap-1">
              <dt className="font-semibold">{copy.emailLabel}</dt>
              <dd className="m-0 break-words">{email}</dd>
            </dl>
          ) : null}
          {onManageSignIn ? (
            <>
              <p className="gg-hint m-0">{copy.securityHint}</p>
              <div className="flex flex-wrap gap-2">
                <button type="button" className="gg-btn gg-btn-secondary" onClick={onManageSignIn}>
                  {copy.manageSignIn}
                </button>
              </div>
            </>
          ) : null}
        </section>
      ) : null}
      <section className="gg-panel flex flex-col gap-3" aria-labelledby={`${id}-payments`}>
        <h2 id={`${id}-payments`} className="text-[16px] m-0">
          {copy.paymentsHeading}
        </h2>
        <div className="gg-panel !bg-[var(--color-bg)] flex flex-col gap-1">
          <h3 className="gg-hint text-[14px] font-normal m-0">{copy.planHeading}</h3>
          <p className="m-0 text-[18px] font-semibold">{copy.planName}</p>
          <p className="gg-hint m-0">{copy.planBody}</p>
        </div>
        <div className="gg-panel !bg-[var(--color-bg)] flex flex-col gap-3">
          <h3 className="gg-hint text-[14px] font-normal m-0">{copy.cardHeading}</h3>
          <p className="m-0 flex items-center gap-2 text-[18px] font-semibold">
            <CreditCard aria-hidden="true" size={20} />
            <span>{copy.cardNone}</span>
          </p>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="gg-btn gg-btn-secondary" onClick={showCardNote}>
              {copy.cardAdd}
            </button>
          </div>
          <p role="status" aria-live="polite" className="gg-hint m-0 text-[13px]">
            {cardNote ? copy.cardNotOpen : ''}
          </p>
        </div>
      </section>
      {peopleHelping}
      <section className="gg-panel flex flex-col gap-3" aria-labelledby={`${id}-signout`}>
        <h2 id={`${id}-signout`} className="text-[16px] m-0">
          {copy.signOutHeading}
        </h2>
        <p className="gg-hint m-0">{copy.signOutHint}</p>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="gg-btn gg-btn-secondary" onClick={onSignOut}>
            {copy.signOut}
          </button>
        </div>
      </section>
      {plans ? (
        <>
          {settings?.removeMember ? <div className="gg-panel flex flex-col gap-3">{settings.removeMember}</div> : null}
          <PlansPanel plans={plans} settings={settings} />
        </>
      ) : settings ? (
        <AccountSettingsSection {...settings} />
      ) : null}
    </>
  );
}

interface PlansPanelProps {
  plans: readonly PlanPerson[];
  settings?: SettingsProps;
}

/** "Your plans": a text copy kept outside the app, then (below it) the device removal. */
function PlansPanel({ plans, settings }: PlansPanelProps) {
  const id = useId();
  const [status, setStatus] = useState('');
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  // Emptied first, then set after a tick, so a second download is announced again.
  function download() {
    setStatus('');
    downloadPlans(buildPlansText(plans, copy));
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setStatus(copy.plansDownloaded), 50);
  }

  return (
    <section className="gg-panel flex flex-col gap-3" aria-labelledby={`${id}-plans`}>
      <h2 id={`${id}-plans`} className="text-[16px] m-0">
        {copy.plansHeading}
      </h2>
      <p className="gg-hint m-0">{plans.length === 0 ? copy.plansNone : copy.plansHint}</p>
      {plans.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          <button type="button" className="gg-btn gg-btn-secondary" onClick={download}>
            {copy.plansDownload}
          </button>
        </div>
      ) : null}
      <p role="status" aria-live="polite" className="gg-hint m-0 text-[13px]">
        {status}
      </p>
      {settings ? <SettingsBody onRemoveEverything={settings.onRemoveEverything} signsOut={settings.signsOut} /> : null}
    </section>
  );
}

interface DetailsFormProps {
  fullName: string | null;
  birthDate: string | null;
  /** The identity hook's own calm copy for a failure that is not about a value. */
  error: string | null;
  onSave: NonNullable<ProfileProps['onSaveDetails']>;
}

/** Checks both values the way the server does. Returns the calm message for each field that is wrong. */
export function checkDetails(nameText: string, dateText: string): { fullName: string | null; birthDate: string | null; nameError?: string; dateError?: string } {
  const fullName = normalizeFullName(nameText) as string | null;
  let nameError: string | undefined;
  if (fullName !== null && [...fullName].length > FULL_NAME_MAX_LENGTH) {
    nameError = copy.fullNameTooLong;
  } else if (fullName !== null && !isValidFullName(fullName)) {
    nameError = copy.fullNameBadChars;
  }
  let birthDate: string | null = null;
  let dateError: string | undefined;
  if (dateText.trim() !== '') {
    const iso = dateToISO(dateText, BIRTH_YEARS);
    if (!iso) {
      dateError = copy.birthDateIncomplete;
    } else if (!isValidBirthDate(iso)) {
      dateError = copy.birthDateOutOfRange;
    } else {
      birthDate = iso;
    }
  }
  return { fullName, birthDate, nameError, dateError };
}

/** Full name and date of birth: optional, saved on their own button so the name above keeps its own flow. */
function DetailsForm({ fullName, birthDate, error, onSave }: DetailsFormProps) {
  const id = useId();
  // Until the person types, show what is known, including values that load late.
  const [typedName, setTypedName] = useState<string | null>(null);
  const [typedDate, setTypedDate] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [saved, setSaved] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);
  const [dateError, setDateError] = useState<string | null>(null);
  const [serverInvalid, setServerInvalid] = useState(false);
  // The hook's error is shared with the name form; show it here only after this form's own save failed.
  const [failed, setFailed] = useState(false);
  const nameValue = typedName ?? fullName ?? '';
  const dateValue = typedDate ?? (birthDate ? isoToDate(birthDate) : '');

  function reset() {
    setSaved(false);
    setServerInvalid(false);
    setFailed(false);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (pending) {
      return;
    }
    const checked = checkDetails(nameValue, dateValue);
    setNameError(checked.nameError ?? null);
    setDateError(checked.dateError ?? null);
    setServerInvalid(false);
    setFailed(false);
    if (checked.nameError || checked.dateError) {
      return;
    }
    setPending(true);
    setSaved(false);
    try {
      const result = await onSave({ fullName: checked.fullName, birthDate: checked.birthDate });
      if (result.ok) {
        setTypedName(null);
        setTypedDate(null);
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
  if (nameError || dateError) {
    message = '';
  } else if (serverInvalid) {
    message = copy.detailsInvalid;
  } else if (failed && error) {
    message = error;
  } else if (saved) {
    message = copy.detailsSaved;
  }
  const isError = Boolean(serverInvalid || (failed && error));

  return (
    <form className="flex flex-col gap-3" onSubmit={(event) => void submit(event)} noValidate>
      <label htmlFor={`${id}-full`} className="font-semibold">
        {copy.fullNameLabel}
      </label>
      <input
        id={`${id}-full`}
        type="text"
        className="gg-input"
        autoComplete="name"
        autoCapitalize="words"
        value={nameValue}
        aria-describedby={nameError ? `${id}-full-error ${id}-full-hint` : `${id}-full-hint`}
        aria-invalid={nameError ? true : undefined}
        onChange={(event) => {
          setTypedName(event.target.value);
          setNameError(null);
          reset();
        }}
      />
      <p id={`${id}-full-hint`} className="gg-hint m-0 text-[13px]">
        {copy.fullNameHint}
      </p>
      {nameError ? (
        <p id={`${id}-full-error`} role="alert" className="m-0 text-[13px] font-semibold">
          {nameError}
        </p>
      ) : null}
      <label htmlFor={`${id}-dob`} className="font-semibold">
        {copy.birthDateLabel}
      </label>
      <DateInput
        id={`${id}-dob`}
        value={dateValue}
        min={`${BIRTH_YEAR_MIN}-01-01`}
        max={todayISO()}
        describedBy={`${id}-dob-hint`}
        visibleHelp
        years={BIRTH_YEARS}
        error={dateError ?? undefined}
        onChange={(next) => {
          setTypedDate(next);
          setDateError(null);
          reset();
        }}
      />
      <p id={`${id}-dob-hint`} className="gg-hint m-0 text-[13px]">
        {copy.birthDateHint}
      </p>
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

interface SettingsProps {
  onRemoveEverything: () => Promise<void>;
  signsOut?: boolean;
  removeMember?: ReactNode;
}

/** The Settings content (signed out, or accounts off) inside the CMS shell: the same body as the Settings screen. */
export function AccountSettingsSection({ onRemoveEverything, signsOut, removeMember }: SettingsProps) {
  return (
    <div className="gg-panel flex flex-col gap-4">
      <SettingsBody onRemoveEverything={onRemoveEverything} signsOut={signsOut} removeMember={removeMember} />
    </div>
  );
}
