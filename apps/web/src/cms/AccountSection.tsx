import { useEffect, useId, useRef, useState } from 'react';
import { CreditCard } from '@phosphor-icons/react/CreditCard';
import type { ReactNode } from 'react';
import { screenCopy } from '@griever/copy';
import type { Address, SectionFields } from '@griever/shared';
import { PersonalDetailsForm } from './PersonalDetailsForm';
import type { PersonalDetails, SaveDetailsResult } from './PersonalDetailsForm';
import { buildPlansText, downloadPlans } from '../lib/exportPlans';
import type { PlanPerson } from '../lib/exportPlans';
import { PhoneReadyList, readyPhoneSections } from './PhoneReady';

const copy = screenCopy('account');

interface ProfileProps {
  /** The account has no name yet: the name prompt (first and last name), with its intro line. */
  asksName?: boolean;
  /** The name messages are signed with. Fills First name only when no first or last name is saved yet. */
  senderName: string | null;
  firstName?: string | null;
  lastName?: string | null;
  birthDate?: string | null;
  address?: Address | null;
  /** False until the profile has loaded: Save details waits, so empty fields never overwrite stored values. */
  profileLoaded?: boolean;
  /** The identity hook's own calm copy, shown as-is. */
  error: string | null;
  /** "People helping you", when sharing is on. */
  peopleHelping?: ReactNode;
  /** Saves the personal details. Resolves ok, or says the server refused a value. */
  onSaveDetails: (details: PersonalDetails) => Promise<SaveDetailsResult>;
  onSignOut: () => void;
  /** Deletes the account. Resolves once it is deleted; rejects when it was not, and nothing local is removed. When absent, the Delete account panel is not shown. */
  onDeleteAccount?: () => Promise<void>;
  /** The signed-in email, shown read-only. Absent until Clerk has loaded it. */
  email?: string | null;
  /** Opens Clerk's own account screen. Absent when Clerk is not ready, and the button is not shown. */
  onManageSignIn?: () => void;
  /** The Settings actions (remove a member), shown under the account content. */
  settings?: SettingsProps;
  /** The people this account can open (the People list). When given, the "Your plans" panel is shown. */
  plans?: readonly (PlanPerson & Pick<Partial<SectionFields>, 'sectionStatus'>)[];
}

/**
 * The signed-in account content inside the CMS shell, as a settings page: Profile, Sign-in and security, Your plans, On your phone, Payments, People helping you (with "remove a member" beside it), Help and support, Sign out, each its own panel with an h2. The "What you'll need" list is the shell's panel, not repeated here.
 * The shell owns the h1; there is no Back here.
 */
export function AccountSection({ asksName, senderName, firstName, lastName, birthDate, address, profileLoaded = true, error, peopleHelping, onSaveDetails, onSignOut, onDeleteAccount, email, onManageSignIn, settings, plans }: ProfileProps) {
  const id = useId();
  const [cardNote, setCardNote] = useState(false);

  // A second press clears the note and sets it again, so a screen reader says it again.
  function showCardNote() {
    setCardNote(false);
    setTimeout(() => setCardNote(true), 50);
  }

  return (
    <>
      <section className="gg-panel flex flex-col gap-3" aria-labelledby={`${id}-profile`}>
        <h2 id={`${id}-profile`} className="text-[16px] m-0">
          {copy.profileHeading}
        </h2>
        <PersonalDetailsForm
          namesOnly={asksName}
          profileLoaded={profileLoaded}
          headingLevel={3}
          senderName={senderName}
          firstName={firstName ?? null}
          lastName={lastName ?? null}
          birthDate={birthDate ?? null}
          address={address ?? null}
          error={error}
          onSave={onSaveDetails}
        />
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
      {plans ? (
        <>
          <PlansPanel plans={plans} />
        </>
      ) : null}
      <PhonePanel ready={readyPhoneSections(plans ?? [])} />
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
      {settings?.removeMember ? <div className="gg-panel flex flex-col gap-3">{settings.removeMember}</div> : null}
      <SupportPanel />
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
      {onDeleteAccount ? <DeletePanel onDelete={onDeleteAccount} /> : null}
    </>
  );
}

interface DeletePanelProps {
  onDelete: () => Promise<void>;
}

/** "Delete account": one button opens a confirm step; only the second, deliberate button deletes. */
function DeletePanel({ onDelete }: DeletePanelProps) {
  const id = useId();
  const [step, setStep] = useState<'idle' | 'confirm' | 'deleting'>('idle');
  const [failed, setFailed] = useState(false);
  const openerRef = useRef<HTMLButtonElement>(null);
  const confirmRef = useRef<HTMLHeadingElement>(null);
  const wasConfirming = useRef(false);

  // Opening the confirm moves focus into it; closing it returns focus to the opener.
  useEffect(() => {
    if (step === 'confirm' && !wasConfirming.current) {
      confirmRef.current?.focus();
    } else if (step === 'idle' && wasConfirming.current) {
      openerRef.current?.focus();
    }
    wasConfirming.current = step !== 'idle';
  }, [step]);

  async function confirm() {
    if (step === 'deleting') {
      return;
    }
    setFailed(false);
    setStep('deleting');
    try {
      await onDelete();
    } catch {
      setFailed(true);
      setStep('confirm');
    }
  }

  function cancel() {
    if (step === 'deleting') {
      return;
    }
    setFailed(false);
    setStep('idle');
  }

  const deleting = step === 'deleting';
  return (
    <section className="gg-panel flex flex-col gap-3" aria-labelledby={`${id}-delete`}>
      <h2 id={`${id}-delete`} className="text-[16px] m-0">
        {copy.deleteHeading}
      </h2>
      {step === 'idle' ? (
        <>
          <p className="gg-hint m-0">{copy.deleteHint}</p>
          <div className="flex flex-wrap gap-2">
            <button ref={openerRef} type="button" className="gg-btn gg-btn-secondary" onClick={() => setStep('confirm')}>
              {copy.deleteOpen}
            </button>
          </div>
        </>
      ) : (
        <div role="group" aria-labelledby={`${id}-confirm`} className="flex flex-col gap-3">
          <h3 id={`${id}-confirm`} ref={confirmRef} tabIndex={-1} className="text-[16px] m-0">
            {copy.deleteConfirmHeading}
          </h3>
          <p className="m-0">{copy.deleteConfirmBody}</p>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="gg-btn gg-btn-primary" aria-disabled={deleting} onClick={cancel}>
              {copy.deleteCancel}
            </button>
            {/* The busy button keeps full contrast; the status line below says what is happening. */}
            <button type="button" className={`gg-btn gg-btn-secondary ${deleting ? '!opacity-100' : ''}`} aria-disabled={deleting} onClick={() => void confirm()}>
              {copy.deleteConfirmAction}
            </button>
          </div>
        </div>
      )}
      <p role="status" aria-live="polite" className="m-0 text-[13px] font-semibold">
        {deleting ? copy.deleting : failed ? copy.deleteFailed : ''}
      </p>
    </section>
  );
}

interface PhonePanelProps {
  ready: ReturnType<typeof readyPhoneSections>;
}

/** "On your phone": what is ready to send, and where sending happens. No store badges or links until the app is in the stores. */
function PhonePanel({ ready }: PhonePanelProps) {
  const id = useId();
  return (
    <section className="gg-panel flex flex-col gap-3" aria-labelledby={`${id}-phone`}>
      <h2 id={`${id}-phone`} className="text-[16px] m-0">
        {copy.phoneHeading}
      </h2>
      <p className="m-0">{copy.phoneBody}</p>
      <p className="gg-hint m-0">{copy.phoneNotInStores}</p>
      {ready.length > 0 ? <PhoneReadyList ready={ready} /> : <p className="gg-hint m-0">{copy.phoneNoneReady}</p>}
    </section>
  );
}

/** "Help and support": an email link to the support address. */
function SupportPanel() {
  const id = useId();
  const href = `mailto:${copy.supportEmail}?subject=${encodeURIComponent(copy.supportSubject)}`;
  return (
    <section className="gg-panel flex flex-col gap-3" aria-labelledby={`${id}-support`}>
      <h2 id={`${id}-support`} className="text-[16px] m-0">
        {copy.supportHeading}
      </h2>
      <p className="gg-hint m-0">{copy.supportBody}</p>
      <p className="m-0">
        <a href={href} className="inline-flex items-center min-h-[44px] underline [overflow-wrap:anywhere]">
          {copy.supportEmail}
        </a>
      </p>
    </section>
  );
}

interface PlansPanelProps {
  plans: readonly PlanPerson[];
}

/** "Your plans": a text copy kept outside the app. */
function PlansPanel({ plans }: PlansPanelProps) {
  const id = useId();
  const [status, setStatus] = useState('');
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  // Emptied first, then set after a tick, so a second download is announced again.
  function download() {
    setStatus('');
    downloadPlans(buildPlansText(plans, copy));
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      setStatus(copy.plansDownloaded);
      timer.current = setTimeout(() => setStatus(''), 10000);
    }, 50);
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
    </section>
  );
}

interface SettingsProps {
  removeMember?: ReactNode;
}

/** Your account when nobody is signed in, or accounts are off: the remove-a-member section when there is one, then Help and support. */
export function AccountSettingsSection({ removeMember }: SettingsProps) {
  return (
    <>
      {removeMember ? <div className="gg-panel flex flex-col gap-4">{removeMember}</div> : null}
      <SupportPanel />
    </>
  );
}
