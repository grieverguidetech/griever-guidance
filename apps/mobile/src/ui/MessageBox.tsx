import { useId, useRef, useState } from 'react';
import type { ComponentRef, ReactNode } from 'react';
import { Keyboard, Platform, StyleSheet, Text, TextInput, View } from 'react-native';
import type { StyleProp, TextStyle } from 'react-native';
import { colors, radius, spacing } from '@griever/tokens';
import { Button } from './Button';
import type { ButtonNode } from './Button';
import { focusNode } from './focusNode';
import { Body } from './Text';
import { useSerifStyle } from './typography';

/** The four words of the toggle (libs/copy/screens/phoneReady.json). The names are what a screen reader says. */
export interface MessageToggleCopy {
  edit: string;
  editName: string;
  done: string;
  doneName: string;
}

export interface MessageBoxProps {
  label: string;
  /** The small line under the box. */
  caption?: string;
  value: string;
  onChangeText: (value: string) => void;
  /** Without it the box is always editable. */
  toggle?: MessageToggleCopy;
  placeholder?: string;
  maxLength?: number;
  /** Size and font size of the box. Reading and editing share them, so the text does not jump. */
  boxStyle: StyleProp<TextStyle>;
  /** Drawn between the label row and the box (for example the first-name line). */
  children?: ReactNode;
}

/** Web: lets apps/web/src/styles.css draw its field focus ring (data-gg-field). Ignored on native. */
const webFieldHook: Record<string, unknown> = { dataSet: { ggField: 'true' } };

/**
 * A message box that reads as plain text until Edit is tapped (#968), so a touch meant to scroll
 * never opens the keyboard. Done, or leaving the box, goes back to reading. The words are the
 * caller's state, so nothing is lost across the toggle.
 */
export function MessageBox({ label, caption, value, onChangeText, toggle, placeholder, maxLength, boxStyle, children }: MessageBoxProps) {
  const font = useSerifStyle('regular');
  const labelId = useId();
  const captionId = useId();
  const input = useRef<ComponentRef<typeof TextInput> | null>(null);
  const toggleRef = useRef<ButtonNode>(null);
  const [editing, setEditing] = useState(toggle === undefined);
  const [focused, setFocused] = useState(false);
  // Set once, when editing starts, so the cursor lands at the end. Typing moves it from there.
  const [selection, setSelection] = useState<{ start: number; end: number } | undefined>(undefined);
  // On web, pressing Done blurs the box first. Without this the blur would end editing and the same click would start it again.
  const donePressed = useRef(false);

  const startEditing = () => {
    donePressed.current = false;
    setSelection({ start: value.length, end: value.length });
    setEditing(true);
  };
  const stopEditing = () => {
    donePressed.current = false;
    setEditing(false);
    setSelection(undefined);
    Keyboard.dismiss();
  };
  const press = () => {
    if (editing) {
      stopEditing();
      // The box is gone, so a screen reader and the keyboard cursor stay on the button.
      focusNode(toggleRef.current);
    } else {
      startEditing();
    }
  };

  const captionProps = caption ? { 'aria-describedby': captionId } : {};
  return (
    <View style={styles.field}>
      <View style={styles.labelRow}>
        <Body tone="strong" id={labelId} onPress={editing ? () => input.current?.focus() : undefined}>
          {label}
        </Body>
        {toggle ? (
          <Button
            label={editing ? toggle.done : toggle.edit}
            accessibilityName={editing ? toggle.doneName : toggle.editName}
            variant="tertiary"
            buttonRef={toggleRef}
            onPressIn={() => {
              donePressed.current = editing;
            }}
            onPress={press}
          />
        ) : null}
      </View>
      {children}
      {editing ? (
        <TextInput
          ref={input}
          style={[styles.box, font, boxStyle, focused && Platform.OS !== 'web' && styles.boxFocused]}
          onFocus={() => setFocused(true)}
          onBlur={() => {
            setFocused(false);
            if (toggle && !donePressed.current) {
              setEditing(false);
              setSelection(undefined);
            }
          }}
          {...webFieldHook}
          // Web names the field from the visible label; native reads the label text directly.
          aria-labelledby={labelId}
          accessibilityLabel={label}
          accessibilityHint={caption}
          {...captionProps}
          multiline
          maxLength={maxLength}
          textAlignVertical="top"
          autoCapitalize="sentences"
          placeholder={placeholder}
          placeholderTextColor={colors['neutral-700']}
          autoFocus={toggle !== undefined}
          selection={selection}
          onSelectionChange={() => setSelection(undefined)}
          value={value}
          onChangeText={onChangeText}
        />
      ) : (
        <Text
          style={[styles.box, font, boxStyle, value === '' && placeholder ? styles.placeholder : undefined]}
          accessible
          // Read as the label, then the words, like the box it stands in for.
          accessibilityLabel={label}
          accessibilityValue={{ text: value === '' ? (placeholder ?? '') : value }}
          accessibilityHint={caption}
          aria-labelledby={labelId}
          {...captionProps}
        >
          {value === '' ? placeholder : value}
        </Text>
      )}
      {caption ? (
        <Body tone="muted" small id={captionId}>
          {caption}
        </Body>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  field: { gap: spacing[1] },
  labelRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: spacing[1] },
  box: {
    padding: spacing[2],
    borderWidth: 1,
    borderColor: colors['neutral-600'],
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    color: colors.ink,
    textAlignVertical: 'top',
  },
  placeholder: { color: colors['neutral-700'] },
  // Native focus cue (web draws its own ring through data-gg-field).
  boxFocused: { borderColor: colors['accent-700'], borderWidth: 2 },
});
