import { useId, useRef } from 'react';
import type { ReactNode } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { spacing } from '@griever/tokens';
import { AddressFields, LabelledInput } from '../../components/AddressFields';
import type { AddressFieldsCopy } from '../../components/AddressFields';
import { Button } from '../Button';
import { Heading } from '../Heading';
import type { HeadingProps } from '../Heading';
import { Status } from '../Status';
import { Body } from '../Text';

/** The words the screen needs. libs/copy/screens/account.json has these keys, plus more; the last two come from phoneAccount.json. */
export interface AccountCopy extends AddressFieldsCopy {
  heading: string;
  back: string;
  firstNameLabel: string;
  lastNameLabel: string;
  birthDateLabel: string;
  birthDateHint: string;
  signOut: string;
  offline: string;
  /** Read after a required field's label, for example "required". */
  requiredWord: string;
  /** Read after an optional field's label when the label does not say it, for example "optional". */
  optionalWord: string;
}

/** The fields that are typed. The date of birth is picked, so the app passes it in `renderBirthDate`. */
export type DetailField = 'firstName' | 'lastName' | 'line1' | 'line2' | 'city' | 'state' | 'zip';
export type DetailValues = Record<DetailField, string>;
export type DetailErrors = Partial<Record<DetailField | 'birthDate', string>>;

export interface AccountProps {
  copy: AccountCopy;
  values: DetailValues;
  onChange: (field: DetailField, text: string) => void;
  /** A calm message under each field that is wrong. */
  errors?: DetailErrors;
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
  fieldDisabled,
  primaryLabel,
  onPrimary,
  primaryBusy,
  onSignOut,
  offline,
  status,
  onBack,
  headingRef,
  children,
}: AccountProps) {
  const birthLabelId = useId();
  const offlineId = useId();
  const statusId = useId();
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
      <LabelledInput
        label={copy.firstNameLabel}
        accessibleName={`${copy.firstNameLabel}, ${copy.requiredWord}`}
        value={values.firstName}
        error={errors.firstName}
        editable={!fieldDisabled}
        textContentType="givenName"
        autoComplete="given-name"
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
        onChangeText={(text) => onChange('lastName', text)}
      />
      <View style={styles.field}>
        <Body tone="strong" id={birthLabelId}>
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
      <AddressFields copy={copy} values={values} errors={errors} onChange={onChange} editable={!fieldDisabled} onSubmit={submit} />
      <Status id={statusId} message={status?.message} tone={status?.tone} />
      <Button label={primaryLabel} ariaDisabled={primaryBusy === true} announceDisabled onPress={submit} />
      {onSignOut ? <Button label={copy.signOut} variant="header" onPress={onSignOut} /> : null}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { gap: spacing[3] },
  topBar: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing[1], justifyContent: 'space-between', alignItems: 'center' },
  head: { gap: spacing[1] },
  field: { gap: spacing[1] },
});
