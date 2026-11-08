import { useEffect, useId, useRef } from 'react';
import type { ComponentRef, ReactNode } from 'react';
import { AccessibilityInfo, findNodeHandle, Platform, StyleSheet, TextInput, View } from 'react-native';
import { colors, spacing } from '@griever/tokens';
import { AddressFields, LabelledInput } from '../../components/AddressFields';
import { DeleteAccountPanel } from '../../components/DeleteAccountPanel';
import type { DeleteAccountCopy, DeleteOutcome } from '../../components/DeleteAccountPanel';
import type { AddressFieldsCopy } from '../../components/AddressFields';
import { Button } from '../Button';
import { Heading } from '../Heading';
import { SerifText } from '../SerifText';
import type { HeadingProps } from '../Heading';
import { Status } from '../Status';
import { Body } from '../Text';

/** The words the screen needs. libs/copy/screens/account.json has these keys, plus more; the phone-only ones come from phoneAccount.json. */
export interface AccountCopy extends AddressFieldsCopy, DeleteAccountCopy {
  heading: string;
  back: string;
  firstNameLabel: string;
  lastNameLabel: string;
  birthDateLabel: string;
  birthDateHint: string;
  signOut: string;
  offline: string;
  profileHeading: string;
  securityHeading: string;
  emailLabel: string;
  securityHint: string;
  manageSignIn: string;
  signOutHeading: string;
  signOutHint: string;
  supportHeading: string;
  supportBody: string;
  supportEmail: string;
  /** The phoneAccount words: what Manage sign-in and the support button do, the support button, and the line shown when the mail app did not open. */
  manageSignInHint: string;
  manageSignInFailed: string;
  supportButton: string;
  supportHint: string;
  supportFailed: string;
  /** Read after a required field's label, for example "required". */
  requiredWord: string;
  /** Read after an optional field's label when the label does not say it, for example "optional". */
  optionalWord: string;
  /** The retry button after the profile could not be loaded, for example "Try again". */
  retry: string;
}

/** The fields that are typed. The date of birth is picked, so the app passes it in `renderBirthDate`. */
export type DetailField = 'firstName' | 'lastName' | 'line1' | 'line2' | 'city' | 'state' | 'zip';
export type DetailValues = Record<DetailField, string>;
export type DetailErrors = Partial<Record<DetailField | 'birthDate', string>>;

/** The order of the typed fields, for the Next key. The date is a button, so Next skips it. */
const TYPED_ORDER: readonly DetailField[] = ['firstName', 'lastName', 'line1', 'line2', 'city', 'state', 'zip'];

/** Asks the screen to move focus to a field. A new `id` asks again for the same field. */
export interface FocusRequest {
  field: DetailField | 'birthDate';
  id: number;
}

export interface AccountProps {
  copy: AccountCopy;
  values: DetailValues;
  onChange: (field: DetailField, text: string) => void;
  /** A calm message under each field that is wrong. */
  errors?: DetailErrors;
  /** Moves keyboard and screen-reader focus to this field (the first wrong one after a failed save). */
  focusRequest?: FocusRequest | null;
  /** The date of birth control (the app's native date picker). Gets the name a screen reader says for it. */
  renderBirthDate: (props: { accessibleName: string }) => ReactNode;
  /** The fields cannot be edited (the session has ended). */
  fieldDisabled?: boolean;
  /** Save, Continue or Sign in: the one primary action. The app decides what it does. */
  primaryLabel: string;
  onPrimary: () => void | Promise<void>;
  /** The primary action is running: reads as unavailable and presses are ignored. */
  primaryBusy?: boolean;
  /** Leave unset to hide Sign out (first visit, or the session has ended). */
  onSignOut?: () => void;
  /** Shows the offline line. */
  offline?: boolean;
  /** One calm line: a save result or an error. The status node is always rendered. */
  status?: { message: string; tone?: 'muted' | 'danger' };
  /** Shows a Try again button above Save: the profile could not be loaded and there is nothing to edit safely. */
  onRetry?: () => void;
  /** The signed-in email, shown read-only. Leave unset until it has loaded. */
  email?: string | null;
  /** Opens Clerk's account page. Leave unset when there is no address, and the button is not shown. */
  onManageSignIn?: () => void;
  /** Opening the account page failed: shows a calm line. */
  manageFailed?: boolean;
  /** Opens the email app to write to support. */
  onSupport: () => void;
  /** The email app did not open: shows a calm line that the address can be copied. */
  supportFailed?: boolean;
  /** Deletes the account. Leave unset to hide Delete account (accounts off, session ended, or Clerk not ready). */
  onDeleteAccount?: () => Promise<DeleteOutcome>;
  onBack: () => void;
  headingRef?: HeadingProps['headingRef'];
  /** Under the form, for example "People helping you". */
  children?: ReactNode;
}

/**
 * "Your account": the personal details (first and last name, date of birth, address) and the actions. Mobile's own screen (apps/mobile/src/ui). It owns no state; the app holds the values.
 */
export function Account({
  copy,
  values,
  onChange,
  errors = {},
  renderBirthDate,
  focusRequest,
  fieldDisabled,
  primaryLabel,
  onPrimary,
  primaryBusy,
  onSignOut,
  offline,
  status,
  onRetry,
  email,
  onManageSignIn,
  onSupport,
  supportFailed,
  manageFailed,
  onDeleteAccount,
  onBack,
  headingRef,
  children,
}: AccountProps) {
  const birthLabelId = useId();
  const nodes = useRef<Partial<Record<DetailField, ComponentRef<typeof TextInput> | null>>>({});
  const birthNode = useRef<ComponentRef<typeof View>>(null);
  const register = (field: DetailField) => (node: ComponentRef<typeof TextInput> | null) => {
    nodes.current[field] = node;
  };
  const next = (field: DetailField) => {
    const after = TYPED_ORDER[TYPED_ORDER.indexOf(field) + 1];
    if (after) {
      nodes.current[after]?.focus();
    }
  };

  useEffect(() => {
    if (!focusRequest) {
      return;
    }
    const target = focusRequest.field === 'birthDate' ? birthNode.current : nodes.current[focusRequest.field];
    if (!target) {
      return;
    }
    if (focusRequest.field !== 'birthDate') {
      nodes.current[focusRequest.field]?.focus();
    }
    const handle = findNodeHandle(target);
    if (handle) {
      AccessibilityInfo.setAccessibilityFocus(handle);
    }
  }, [focusRequest]);
  const offlineId = useId();
  const statusId = useId();
  const supportStatusId = useId();
  const manageStatusId = useId();
  // A ref, not state: two fast taps can both run before a re-render shows `primaryBusy`.
  const inFlight = useRef(false);
  const submit = () => {
    // Web keeps its original behaviour exactly; the ref guard is for the phone apps.
    if (Platform.OS === 'web') {
      if (!primaryBusy) {
        onPrimary();
      }
      return;
    }
    if (primaryBusy || inFlight.current) {
      return;
    }
    inFlight.current = true;
    const release = () => {
      inFlight.current = false;
    };
    let result: void | Promise<void>;
    try {
      result = onPrimary();
    } catch (error) {
      release();
      throw error;
    }
    if (result && typeof result.then === 'function') {
      // Held until the save settles. A handler that returns nothing finishes at once.
      void result.then(release, release);
    } else {
      release();
    }
  };
  return (
    <View style={styles.screen}>
      <View style={styles.topBar}>
        <Button label={copy.back} variant="header" onPress={onBack} />
      </View>
      <View style={styles.head}>
        <Heading level={1} headingRef={headingRef}>
          {copy.heading}
        </Heading>
      </View>
      <Status id={offlineId} message={offline ? copy.offline : undefined} />
      <Heading level={2}>{copy.profileHeading}</Heading>
      <LabelledInput
        label={copy.firstNameLabel}
        accessibleName={`${copy.firstNameLabel}, ${copy.requiredWord}`}
        value={values.firstName}
        error={errors.firstName}
        editable={!fieldDisabled}
        textContentType="givenName"
        autoComplete="given-name"
        inputRef={register('firstName')}
        onSubmitEditing={() => next('firstName')}
        onChangeText={(text) => onChange('firstName', text)}
      />
      <LabelledInput
        label={copy.lastNameLabel}
        accessibleName={copy.lastNameLabel}
        value={values.lastName}
        error={errors.lastName}
        editable={!fieldDisabled}
        textContentType="familyName"
        autoComplete="family-name"
        inputRef={register('lastName')}
        onSubmitEditing={() => next('lastName')}
        onChangeText={(text) => onChange('lastName', text)}
      />
      <View ref={birthNode} style={styles.field}>
        {/* Read through the date control's own name, so the label is not read again. */}
        <Body tone="strong" id={birthLabelId} hidden>
          {copy.birthDateLabel}
        </Body>
        {renderBirthDate({ accessibleName: `${copy.birthDateLabel}, ${copy.optionalWord}` })}
        <Body tone="muted" small>
          {copy.birthDateHint}
        </Body>
        {errors.birthDate ? (
          <Body tone="danger" live>
            {errors.birthDate}
          </Body>
        ) : null}
      </View>
      <AddressFields copy={copy} values={values} errors={errors} onChange={onChange} editable={!fieldDisabled} onNext={next} registerRef={register} />
      <Status id={statusId} message={status?.message} tone={status?.tone} />
      {onRetry ? <Button label={copy.retry} variant="secondary" onPress={onRetry} /> : null}
      <Button label={primaryLabel} ariaDisabled={primaryBusy === true} announceDisabled onPress={submit} />
      {email || onManageSignIn ? (
        <View style={styles.group}>
          <Heading level={2}>{copy.securityHeading}</Heading>
          {email ? (
            <View style={styles.field} accessible accessibilityLabel={`${copy.emailLabel}, ${email}`}>
              <Body tone="strong">{copy.emailLabel}</Body>
              <SerifText selectable style={styles.value}>{email}</SerifText>
            </View>
          ) : null}
          {onManageSignIn ? (
            <>
              <Body tone="muted">{copy.securityHint}</Body>
              <Button label={copy.manageSignIn} variant="secondary" hint={copy.manageSignInHint} onPress={onManageSignIn} />
              <Status id={manageStatusId} message={manageFailed ? copy.manageSignInFailed : undefined} />
            </>
          ) : null}
        </View>
      ) : null}
      {onSignOut ? (
        <View style={styles.group}>
          <Heading level={2}>{copy.signOutHeading}</Heading>
          <Body tone="muted">{copy.signOutHint}</Body>
          <Button label={copy.signOut} variant="header" onPress={onSignOut} />
        </View>
      ) : null}
      <View style={styles.group}>
        <Heading level={2}>{copy.supportHeading}</Heading>
        <Body tone="muted">{copy.supportBody}</Body>
        <SerifText selectable style={styles.value}>{copy.supportEmail}</SerifText>
        <Button label={copy.supportButton} variant="secondary" hint={copy.supportHint} onPress={onSupport} />
        <Status id={supportStatusId} message={supportFailed ? copy.supportFailed : undefined} />
      </View>
      {onDeleteAccount ? <DeleteAccountPanel copy={copy} onDelete={onDeleteAccount} /> : null}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { gap: spacing[3] },
  topBar: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing[1], justifyContent: 'space-between', alignItems: 'center' },
  head: { gap: spacing[1] },
  field: { gap: spacing[1] },
  value: { fontSize: 15, lineHeight: 22, color: colors['neutral-800'] },
  group: { gap: spacing[2], marginTop: spacing[2] },
});
