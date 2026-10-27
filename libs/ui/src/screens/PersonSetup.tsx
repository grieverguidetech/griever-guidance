import { useId, useRef, useState } from 'react';
import type { ComponentRef, ReactNode, Ref } from 'react';
import { Platform, StyleSheet, Text, TextInput, View } from 'react-native';
import { colors, radius, spacing } from '@griever/tokens';
import { Button } from '../Button';
import type { ButtonNode } from '../Button';
import { Heading } from '../Heading';
import type { HeadingProps } from '../Heading';
import { Status } from '../Status';
import { Body } from '../Text';
import { useSerifStyle } from '../typography';

/** The words the screen needs. libs/copy/screens/personSetup.json has these keys, plus more. */
export interface PersonSetupCopy {
  heading: string;
  headingEdit: string;
  intro: string;
  back: string;
  checklist: string;
  nameLabel: string;
  /** What a screen reader says for the name field, for example "Their name, required". */
  nameAccessible: string;
  namePlaceholder: string;
  dateLabel: string;
  optional: string;
  senderLabel: string;
  senderPlaceholder: string;
  continue: string;
  /** Why Continue is unavailable while the name is empty. */
  needName: string;
}

export interface PersonSetupProps {
  copy: PersonSetupCopy;
  /** Opened from "Edit": shows the edit heading. */
  editing?: boolean;
  /** A fuller name for Back when the label alone is not enough, for example "Back to home". It must start with the label. */
  backName?: string;
  name: string;
  onNameChange: (name: string) => void;
  /**
   * The date control. Each app brings its own (web's typed field with a calendar, mobile's native
   * picker), so this library never imports a native module. Give the control `labelId` as its label
   * (aria-labelledby on web) and `accessibleName` as the name native reads.
   */
  renderDate: (label: { labelId: string; accessibleName: string }) => ReactNode;
  /** With `onSenderChange`: shows "Your name (optional)". Leave both unset to hide it. */
  sender?: string;
  onSenderChange?: (sender: string) => void;
  onBack: () => void;
  onWhatYoullNeed: () => void;
  onContinue: () => void;
  /** After the Continue button, for example the saved note. */
  footer?: ReactNode;
  headingRef?: HeadingProps['headingRef'];
  /** For the sheet that "What you'll need" opens to return focus to. */
  checklistRef?: Ref<ButtonNode>;
}

/**
 * "Who are we writing about?": the name (required), the date (optional, in the app's own control)
 * and optionally the sender. Built from libs/ui so web (through react-native-web) and mobile show
 * the same screen. It owns no state.
 */
export function PersonSetup({ copy, editing, backName, name, onNameChange, renderDate, sender, onSenderChange, onBack, onWhatYoullNeed, onContinue, footer, headingRef, checklistRef }: PersonSetupProps) {
  const dateLabelId = useId();
  const reasonId = useId();
  const canContinue = name.trim() !== '';
  const reason = canContinue ? undefined : copy.needName;
  const optionalName = (label: string) => `${label} ${copy.optional}`;
  return (
    <View style={styles.screen}>
      <View style={styles.topBar}>
        <Button label={copy.back} accessibilityName={backName} variant="header" onPress={onBack} />
        <Button label={copy.checklist} variant="header" opensDialog onPress={onWhatYoullNeed} buttonRef={checklistRef} />
      </View>
      <View style={styles.head}>
        <Heading level={1} headingRef={headingRef}>
          {editing ? copy.headingEdit : copy.heading}
        </Heading>
        <Body tone="muted">{copy.intro}</Body>
      </View>
      <Field label={copy.nameLabel} accessibleName={copy.nameAccessible} placeholder={copy.namePlaceholder} value={name} onChangeText={onNameChange} capitalize />
      <View style={styles.field}>
        <Body tone="strong" id={dateLabelId} hidden>
          {copy.dateLabel} <Text style={styles.optional}>{copy.optional}</Text>
        </Body>
        {renderDate({ labelId: dateLabelId, accessibleName: optionalName(copy.dateLabel) })}
      </View>
      {onSenderChange ? (
        <Field
          label={copy.senderLabel}
          optional={copy.optional}
          accessibleName={optionalName(copy.senderLabel)}
          placeholder={copy.senderPlaceholder}
          value={sender ?? ''}
          onChangeText={onSenderChange}
          capitalize
        />
      ) : null}
      <Button
        label={copy.continue}
        ariaDisabled={!canContinue}
        announceDisabled
        describedBy={reason ? reasonId : undefined}
        hint={reason}
        onPress={() => {
          if (canContinue) {
            onContinue();
          }
        }}
      />
      <Status id={reasonId} message={reason} />
      {footer}
    </View>
  );
}

/** Web: lets apps/web/src/styles.css draw its field focus ring (data-gg-field). Ignored on native. */
const webFieldHook: Record<string, unknown> = { dataSet: { ggField: 'true' } };

interface FieldProps {
  label: string;
  optional?: string;
  /** The name native reads (web names the field from the visible label). */
  accessibleName: string;
  placeholder: string;
  value: string;
  onChangeText: (value: string) => void;
  capitalize?: boolean;
}

function Field({ label, optional, accessibleName, placeholder, value, onChangeText, capitalize }: FieldProps) {
  const font = useSerifStyle('regular');
  const labelId = useId();
  const [focused, setFocused] = useState(false);
  const input = useRef<ComponentRef<typeof TextInput> | null>(null);
  return (
    <View style={styles.field}>
      <Body tone="strong" id={labelId} hidden onPress={() => input.current?.focus()}>
        {label} {optional ? <Text style={styles.optional}>{optional}</Text> : null}
      </Body>
      <TextInput
        ref={input}
        style={[styles.input, font, focused && Platform.OS !== 'web' && styles.inputFocused]}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        {...webFieldHook}
        // Web names the field from the visible label; native reads the label text directly.
        aria-labelledby={labelId}
        accessibilityLabel={accessibleName}
        autoCapitalize={capitalize ? 'words' : 'none'}
        placeholder={placeholder}
        placeholderTextColor={colors['neutral-700']}
        value={value}
        onChangeText={onChangeText}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { gap: spacing[3] },
  topBar: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center' },
  head: { gap: spacing[1] },
  field: { gap: spacing[1] },
  optional: { color: colors['neutral-700'], fontWeight: '400' },
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
