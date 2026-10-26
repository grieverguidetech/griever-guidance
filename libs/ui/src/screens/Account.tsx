import { useId, useState } from 'react';
import type { ReactNode, Ref } from 'react';
import { Platform, StyleSheet, TextInput, View } from 'react-native';
import { colors, radius, spacing } from '@griever/tokens';
import { Button } from '../Button';
import type { ButtonNode } from '../Button';
import { Heading } from '../Heading';
import type { HeadingProps } from '../Heading';
import { Status } from '../Status';
import { Body } from '../Text';
import { useSerifStyle } from '../typography';

/** The words the screen needs. libs/copy/screens/account.json has these keys, plus more. */
export interface AccountCopy {
  heading: string;
  askHeading: string;
  askIntro: string;
  back: string;
  checklist: string;
  nameLabel: string;
  signOut: string;
  offline: string;
}

export interface AccountProps {
  copy: AccountCopy;
  /** The account has no name yet: "What should we call you?" replaces the heading. */
  asksName?: boolean;
  /** The line under the heading, already chosen. Leave unset for none. */
  intro?: string;
  name: string;
  onNameChange: (name: string) => void;
  /** The field cannot be edited (the session has ended). */
  fieldDisabled?: boolean;
  /** Save, Continue or Sign in: the one primary action. The app decides what it does. */
  primaryLabel: string;
  onPrimary: () => void;
  /** The primary action is running: reads as unavailable and presses are ignored. */
  primaryBusy?: boolean;
  /** Leave unset to hide Sign out (first visit, or the session has ended). */
  onSignOut?: () => void;
  /** Shows the offline line. */
  offline?: boolean;
  /** One calm line: a save result or an error. The status node is always rendered. */
  status?: { message: string; tone?: 'muted' | 'danger' };
  onBack: () => void;
  /** Opens "What you'll need". Leave unset to hide the button (the list is on the page instead). */
  onWhatYoullNeed?: () => void;
  checklistRef?: Ref<ButtonNode>;
  headingRef?: HeadingProps['headingRef'];
  /** Under the form, for example the checklist or "People helping you". */
  children?: ReactNode;
}

/**
 * "Your account" and "What should we call you?": one screen. Built from libs/ui so web (through
 * react-native-web) and mobile show the same screen. It owns no state; the app holds the name.
 */
export function Account({
  copy,
  asksName,
  intro,
  name,
  onNameChange,
  fieldDisabled,
  primaryLabel,
  onPrimary,
  primaryBusy,
  onSignOut,
  offline,
  status,
  onBack,
  onWhatYoullNeed,
  checklistRef,
  headingRef,
  children,
}: AccountProps) {
  const inputFont = useSerifStyle('regular');
  const labelId = useId();
  const introId = useId();
  const offlineId = useId();
  const statusId = useId();
  const [focused, setFocused] = useState(false);
  const submit = () => {
    if (!primaryBusy) {
      onPrimary();
    }
  };
  return (
    <View style={styles.screen}>
      <View style={styles.topBar}>
        <Button label={copy.back} variant="header" onPress={onBack} />
        {onWhatYoullNeed ? (
          <Button label={copy.checklist} variant="header" opensDialog onPress={onWhatYoullNeed} buttonRef={checklistRef} />
        ) : null}
      </View>
      <View style={styles.head}>
        <Heading level={1} headingRef={headingRef}>
          {asksName ? copy.askHeading : copy.heading}
        </Heading>
        {intro ? (
          <Body tone="muted" id={introId}>
            {intro}
          </Body>
        ) : null}
      </View>
      <Status id={offlineId} message={offline ? copy.offline : undefined} />
      <View style={styles.field}>
        <Body tone="strong" id={labelId}>
          {copy.nameLabel}
        </Body>
        <TextInput
          style={[styles.input, inputFont, focused && Platform.OS !== 'web' && styles.inputFocused]}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          {...webFieldHook}
          // Web names the field from the visible label; native reads the label text directly.
          aria-labelledby={labelId}
          aria-describedby={intro ? introId : undefined}
          accessibilityLabel={copy.nameLabel}
          textContentType="name"
          autoComplete="name"
          autoCapitalize="words"
          returnKeyType="go"
          editable={!fieldDisabled}
          value={name}
          onChangeText={onNameChange}
          onSubmitEditing={submit}
        />
      </View>
      <Status id={statusId} message={status?.message} tone={status?.tone} />
      <Button label={primaryLabel} ariaDisabled={primaryBusy === true} announceDisabled onPress={submit} />
      {onSignOut ? <Button label={copy.signOut} variant="header" onPress={onSignOut} /> : null}
      {children}
    </View>
  );
}

/** Web: lets apps/web/src/styles.css draw its field focus ring (data-gg-field). Ignored on native. */
const webFieldHook: Record<string, unknown> = { dataSet: { ggField: 'true' } };

const styles = StyleSheet.create({
  screen: { gap: spacing[3] },
  topBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  head: { gap: spacing[1] },
  field: { gap: spacing[1] },
  input: {
    minHeight: 44,
    padding: spacing[2],
    borderWidth: 1,
    borderColor: colors['neutral-600'],
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    color: colors.ink,
    fontSize: 14,
  },
  // Native focus cue (web draws its own ring through data-gg-field).
  inputFocused: { borderColor: colors['accent-700'], borderWidth: 2 },
});
