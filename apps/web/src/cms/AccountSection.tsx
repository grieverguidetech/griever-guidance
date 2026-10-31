import { useId } from 'react';
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
  /** The Settings actions (remove a member, remove everything from this device), shown under the account content. */
  settings?: SettingsProps;
}

/**
 * The signed-in account content inside the CMS shell: name, sign out, and people helping. The "What you'll need" list is the shell's panel, not repeated here.
 * The shell owns the h1; there is no Back here.
 */
export function AccountSection({ asksName, senderName, error, peopleHelping, onSave, onSignOut, settings }: ProfileProps) {
  const id = useId();
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
      <form className="gg-panel flex flex-col gap-3" onSubmit={onSubmit} noValidate>
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
          <button type="button" className="gg-btn gg-btn-secondary" onClick={onSignOut}>
            {copy.signOut}
          </button>
        </div>
      </form>
      {peopleHelping}
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
