import { useId, useState } from 'react';
import { CreditCard } from '@phosphor-icons/react/CreditCard';
import type { FormEvent, ReactNode } from 'react';
import { screenCopy } from '@griever/copy';
import { SettingsBody } from '../screens/Settings';
import { useNameForm } from '../screens/Profile';

const copy = screenCopy('account');

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
  /** The signed-in email, shown read-only. Absent until Clerk has loaded it. */
  email?: string | null;
  /** Opens Clerk's own account screen. Absent when Clerk is not ready, and the button is not shown. */
  onManageSignIn?: () => void;
  /** The Settings actions (remove a member, remove everything from this device), shown under the account content. */
  settings?: SettingsProps;
}

/**
 * The signed-in account content inside the CMS shell, as a settings page: Profile, Sign-in and security, Payments, People helping you, Sign out, each its own panel with an h2. The "What you'll need" list is the shell's panel, not repeated here.
 * The shell owns the h1; there is no Back here.
 */
export function AccountSection({ asksName, senderName, error, peopleHelping, onSave, onSignOut, email, onManageSignIn, settings }: ProfileProps) {
  const id = useId();
  const [cardNote, setCardNote] = useState(false);

  // A second press clears the note and sets it again, so a screen reader says it again.
  function showCardNote() {
    setCardNote(false);
    setTimeout(() => setCardNote(true), 50);
  }
  const { value, pending, saved, nameError, changeName, submit } = useNameForm({ senderName, onSave });

  let message = '';
  if (nameError) {
    message = nameError;
  } else if (error) {
    message = error;
  } else if (saved) {
    message = copy.saved;
  }
  const isError = Boolean(nameError || error);

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
        {/* Full name and date of birth join this form when the backend has them (#551). */}
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
      {settings ? <AccountSettingsSection {...settings} /> : null}
    </>
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
