import { useEffect, useRef, useState } from 'react';
import type { ComponentRef } from 'react';
import { AccessibilityInfo, findNodeHandle, Linking, Text } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { screenCopy } from '@griever/copy';
import { BIRTH_YEAR_MIN, checkAddress, formatPassingDate, isValidBirthDate, isValidNamePart, NAME_PART_MAX_LENGTH, normalizeNamePart, parseCompleteDate } from '@griever/shared';
import type { Address, AddressField } from '@griever/shared';
import { Account } from '../ui';
import type { UseAccountResult } from '@griever/hooks';
import type { DetailErrors, DetailField, DetailValues, FocusRequest } from '../ui/screens/Account';
import { stateToCode } from '../components/AddressFields';
import { DateField } from '../components/DateField';
import { DeleteCancelledError, DeleteNeedsSignInError, useSignInInfo } from '../lib/clerk';
import { announceAccountDeleted, deleteLocalData } from '../lib/deleteLocalData';
import type { DeleteOutcome } from '../components/DeleteAccountPanel';

const copy = screenCopy('account');
const phoneAccount = screenCopy('phoneAccount');
const personSetup = screenCopy('personSetup');
const phonePerson = screenCopy('phonePerson');

/** The support address as a mailto link, with the subject encoded. */
export function supportMailto(address: string, subject: string): string {
  return `mailto:${address}?subject=${encodeURIComponent(subject)}`;
}

export const SESSION_ENDED = copy.sessionEnded;

/** A date of birth can be long ago; the picker offers any day from here to today. */
const EARLIEST_BIRTH = new Date(BIRTH_YEAR_MIN, 0, 1);
/** The fields in the order they sit on the screen; the first wrong one takes focus. */
const FIELD_ORDER: readonly (DetailField | 'birthDate')[] = ['firstName', 'lastName', 'birthDate', 'line1', 'line2', 'city', 'state', 'zip'];
/** Lets the iOS announcement of the summary line start before focus moves. */
const FOCUS_DELAY_MS = 400;
/** Any four-digit year parses; isValidBirthDate then says whether it is allowed. */
const BIRTH_YEARS = { minYear: 1000, maxYear: 9999 };

/** The picker writes "June 7, 1980"; the profile keeps yyyy-mm-dd. */
function textToIso(text: string): string | null {
  const date = parseCompleteDate(text, BIRTH_YEARS);
  if (!date) {
    return null;
  }
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

function isoToText(iso: string | null | undefined): string {
  const date = iso ? parseCompleteDate(iso, BIRTH_YEARS) : null;
  return date ? formatPassingDate(date) : '';
}

function namePartError(text: string): string | undefined {
  if ([...text].length > NAME_PART_MAX_LENGTH) {
    return copy.fieldTooLong;
  }
  return isValidNamePart(text) ? undefined : copy.fieldBadChars;
}

/** The calm message for one address field the shared check refused. Same words as web. */
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

export interface CheckedDetails {
  details: { firstName: string | null; lastName: string | null; birthDate: string | null; address: Address | null };
  errors: DetailErrors;
}

/** Checks every value the way the server does (and the way web does). The first name is required. */
export function checkDetails(values: DetailValues, birthText: string): CheckedDetails {
  const errors: DetailErrors = {};
  const firstName = normalizeNamePart(values.firstName) as string | null;
  const lastName = normalizeNamePart(values.lastName) as string | null;
  if (firstName === null) {
    errors.firstName = copy.firstNameRequired;
  } else {
    errors.firstName = namePartError(firstName);
  }
  if (lastName !== null) {
    errors.lastName = namePartError(lastName);
  }

  let birthDate: string | null = null;
  if (birthText.trim() !== '') {
    const iso = textToIso(birthText);
    if (!iso) {
      errors.birthDate = copy.birthDateIncomplete;
    } else if (!isValidBirthDate(iso)) {
      errors.birthDate = copy.birthDateOutOfRange;
    } else {
      birthDate = iso;
    }
  }

  let address: Address | null = null;
  const checked = checkAddress({ line1: values.line1, line2: values.line2, city: values.city, state: stateToCode(values.state), zip: values.zip });
  if (checked.ok) {
    address = checked.address;
  } else {
    for (const [field, problem] of Object.entries(checked.errors) as [AddressField, string][]) {
      errors[field] = addressMessage(field, problem);
    }
  }

  const kept: DetailErrors = {};
  for (const [key, message] of Object.entries(errors) as [keyof DetailErrors, string | undefined][]) {
    if (message !== undefined) {
      kept[key] = message;
    }
  }
  return { details: { firstName, lastName, birthDate, address }, errors: kept };
}

type Props = {
  identity: UseAccountResult;
  /** A name typed at sign-up that is not saved yet; shown in the field until it is. */
  initialName?: string | null;
  /** The server ended the session: keep the typed name and offer sign in. */
  sessionEnded?: boolean;
  /** Called after any successful save, so an older unsaved name can never overwrite it. */
  onSaved: () => void;
  onBack: () => void;
  onSignOut: () => void;
  onSignInAgain: () => void;
};

/** The screen is the Account in apps/mobile/src/ui; this holds what is mobile only: saving and focus. */
export function ProfileScreen({ identity, initialName, sessionEnded: sessionEndedProp, onSaved, onBack, onSignOut, onSignInAgain }: Props) {
  const profile = identity.profile;
  // Deleting the account signs the person out before the delete call returns. That is not "your session ended".
  const [removing, setRemoving] = useState(false);
  const sessionEnded = sessionEndedProp && !removing;
  // An account saved before first and last name existed has only the name messages are signed with.
  const noNames = !profile?.firstName && !profile?.lastName;
  const fallbackName = initialName ?? profile?.senderName ?? '';
  const known: DetailValues & { birth: string } = {
    firstName: profile?.firstName ?? (noNames ? fallbackName : ''),
    lastName: profile?.lastName ?? '',
    line1: profile?.address?.line1 ?? '',
    line2: profile?.address?.line2 ?? '',
    city: profile?.address?.city ?? '',
    state: profile?.address?.state ?? '',
    zip: profile?.address?.zip ?? '',
    birth: isoToText(profile?.birthDate),
  };
  // When the session ends the account is cleared; the fields keep what they showed.
  const shown = useRef(known);
  if (!sessionEnded) {
    shown.current = known;
  }
  // Until the person types, show what is known, including values that load late. Typing is never overwritten.
  const [typed, setTyped] = useState<Partial<DetailValues & { birth: string }>>({});
  const values = { ...shown.current, ...typed };
  const [pending, setPending] = useState(false);
  const [saved, setSaved] = useState(false);
  const [errors, setErrors] = useState<DetailErrors>({});
  const [serverInvalid, setServerInvalid] = useState(false);
  const heading = useRef<ComponentRef<typeof Text>>(null);
  // Save is safe once the stored values are known: a live answer (a profile, or "no profile"), or a failed load with a profile kept
  // on the device (the best copy there is). While the first load is still pending, a kept profile may be stale and could overwrite
  // newer edits made elsewhere. After a failed load with nothing kept, empty fields would wipe the stored details. Either way Save waits.
  const failedLoad = identity.profileLoadFailed === true;
  const canSave = identity.profileLoaded || (failedLoad && identity.profile !== null);
  const waiting = !canSave && !sessionEnded;
  // Try again is offered only when the load failed and there is nothing kept to edit.
  const loadFailed = waiting && failedLoad;
  const signIn = useSignInInfo();
  const [supportFailed, setSupportFailed] = useState(false);
  const [manageFailed, setManageFailed] = useState(false);
  const [focusRequest, setFocusRequest] = useState<FocusRequest | null>(null);
  const focusCount = useRef(0);

  // The heading takes screen-reader focus when the screen opens.
  useEffect(() => {
    const handle = heading.current ? findNodeHandle(heading.current) : null;
    if (handle) {
      AccessibilityInfo.setAccessibilityFocus(handle);
    }
  }, []);

  function change(field: DetailField | 'birth', text: string) {
    setTyped((current) => ({ ...current, [field]: text }));
    setErrors((current) => ({ ...current, [field === 'birth' ? 'birthDate' : field]: undefined }));
    setSaved(false);
    setServerInvalid(false);
  }

  async function openSupport() {
    setSupportFailed(false);
    try {
      await Linking.openURL(supportMailto(copy.supportEmail, copy.supportSubject));
    } catch {
      setSupportFailed(true);
    }
  }

  async function manageSignIn() {
    setManageFailed(false);
    try {
      const url = signIn.manageUrl;
      if (!url) {
        throw new Error('No account page address');
      }
      await WebBrowser.openBrowserAsync(url);
    } catch {
      // The person is still on this screen and can press the button again.
      setManageFailed(true);
    }
  }

  /** Deletes the account on the server, and only when that works clears this phone. A failure changes nothing. */
  async function deleteAccount(): Promise<DeleteOutcome> {
    const remove = signIn.deleteAccount;
    if (!remove) {
      return 'failed';
    }
    setRemoving(true);
    try {
      await remove();
    } catch (error) {
      setRemoving(false);
      if (error instanceof DeleteNeedsSignInError) {
        return 'needsSignIn';
      }
      return error instanceof DeleteCancelledError ? 'cancelled' : 'failed';
    }
    // Clerk has ended the session itself. The app (App.tsx) hears this, drops everything it holds in memory
    // and shows the deleted screen in place of the whole send flow, so every way out of it lands clean.
    announceAccountDeleted(await deleteLocalData());
    return 'deleted';
  }

  async function save() {
    // Empty fields must never overwrite stored values, so nothing is saved until they are known.
    if (pending || waiting) {
      return;
    }
    const checked = checkDetails(values, values.birth);
    setErrors(checked.errors);
    setServerInvalid(false);
    const firstWrong = FIELD_ORDER.find((field) => checked.errors[field] !== undefined);
    if (firstWrong) {
      // After the summary line is announced, so focus does not cut it off.
      setTimeout(() => setFocusRequest({ field: firstWrong, id: ++focusCount.current }), FOCUS_DELAY_MS);
      return;
    }
    setPending(true);
    setSaved(false);
    try {
      const result = await identity.updateDetails(checked.details);
      if (result.ok) {
        setTyped({});
        setSaved(true);
        onSaved();
      } else if (result.invalid) {
        setServerInvalid(true);
      }
    } finally {
      setPending(false);
    }
  }

  // Order matters: a session that ended says so; then what is wrong or refused, then an account error, then what is loading; then the saved line.
  const hasErrors = Object.values(errors).some(Boolean);
  let message = '';
  let tone: 'muted' | 'danger' = 'muted';
  if (sessionEnded) {
    message = copy.sessionEnded;
  } else if (hasErrors) {
    message = copy.checkFields;
    tone = 'danger';
  } else if (serverInvalid) {
    message = copy.detailsInvalid;
    tone = 'danger';
  } else if (identity.error) {
    message = identity.error;
    tone = 'danger';
  } else if (loadFailed) {
    // The offline line shows by itself when the phone is offline.
    message = identity.offline ? '' : copy.unavailable;
    tone = 'danger';
  } else if (waiting) {
    message = copy.loadingDetails;
  } else if (saved) {
    message = copy.detailsSaved;
  }
  let primaryLabel = copy.save;
  if (sessionEnded) {
    primaryLabel = copy.signIn;
  } else if (pending) {
    primaryLabel = copy.saving;
  }

  const canDelete = removing || (!sessionEndedProp && !!signIn.deleteAccount);
  return (
    <Account
      copy={{ ...copy, requiredWord: phoneAccount.required, optionalWord: phoneAccount.optional, retry: phoneAccount.retry, manageSignInHint: phoneAccount.manageSignInHint, manageSignInFailed: phoneAccount.manageSignInFailed, supportButton: phoneAccount.supportButton, supportHint: phoneAccount.supportHint, supportFailed: phoneAccount.supportFailed, deleteNeedsSignIn: phoneAccount.deleteNeedsSignIn }}
      values={values}
      onChange={change}
      errors={errors}
      focusRequest={focusRequest}
      renderBirthDate={({ accessibleName }) => (
        <DateField
          copy={{ ...personSetup, dateClear: phonePerson.birthClear, dateHint: errors.birthDate ? `${phonePerson.birthHint}. ${errors.birthDate}` : phonePerson.birthHint }}
          value={values.birth}
          onChange={(text) => change('birth', text)}
          accessibleName={accessibleName}
          maximumDate={new Date()}
          minimumDate={EARLIEST_BIRTH}
        />
      )}
      fieldDisabled={sessionEnded}
      primaryLabel={primaryLabel}
      primaryBusy={sessionEnded ? false : pending || waiting}
      onRetry={loadFailed ? identity.reloadProfile : undefined}
      onPrimary={sessionEnded ? onSignInAgain : save}
      onSignOut={sessionEnded ? undefined : onSignOut}
      email={sessionEnded ? null : signIn.email}
      onManageSignIn={sessionEnded || !signIn.manageUrl ? undefined : () => void manageSignIn()}
      onSupport={() => void openSupport()}
      supportFailed={supportFailed}
      manageFailed={manageFailed}
      onDeleteAccount={canDelete ? deleteAccount : undefined}
      offline={identity.offline}
      status={{ message, tone }}
      onBack={onBack}
      headingRef={heading}
    />
  );
}
