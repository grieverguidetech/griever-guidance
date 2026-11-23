import { useEffect, useId, useRef, useState } from 'react';
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
  /** Told when editing starts and ends, so a screen can hide a competing button (the obituary's Done) while the box is open. */
  onEditingChange?: (editing: boolean) => void;
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
export function MessageBox({ label, caption, value, onChangeText, toggle, placeholder, maxLength, boxStyle, onEditingChange, children }: MessageBoxProps) {
  const font = useSerifStyle('regular');
  const labelId = useId();
  const captionId = useId();
  const input = useRef<ComponentRef<typeof TextInput> | null>(null);
  const toggleRef = useRef<ButtonNode>(null);
  const readingRef = useRef<ComponentRef<typeof Text>>(null);
  // Set when a blur ends editing: the screen reader's cursor then moves to the reading text, once it is drawn.
  const [refocusText, setRefocusText] = useState(false);
  const [editing, setEditing] = useState(toggle === undefined);
  const [focused, setFocused] = useState(false);
  // Set once, when editing starts: the cursor lands at the start. Typing moves it from there.
  const [selection, setSelection] = useState<{ start: number; end: number } | undefined>(undefined);
  // On web, pressing Done blurs the box first. Without this the blur would end editing and the same click would start it again.
  const donePressed = useRef(false);

  useEffect(() => {
    onEditingChange?.(editing);
    return () => onEditingChange?.(false);
    // Only when editing changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing]);

  // On Android the back button closes the keyboard without a blur, so editing would never end.
  const hasToggle = toggle !== undefined;
  useEffect(() => {
    if (!hasToggle || !editing) {
      return undefined;
    }
    const sub = Keyboard.addListener('keyboardDidHide', () => {
      setEditing(false);
      setSelection(undefined);
      setRefocusText(Platform.OS !== 'web');
    });
    return () => sub.remove();
  }, [hasToggle, editing]);

  useEffect(() => {
    if (refocusText && !editing) {
      focusNode(readingRef.current);
      setRefocusText(false);
    }
  }, [refocusText, editing]);

  const startEditing = () => {
    donePressed.current = false;
    setSelection({ start: 0, end: 0 });
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

  const empty = value === '';
  // Web: the text has no role, so a label on it is ignored or read twice; the words are simply read. Native: label, then the words.
  // Android reads the label and may drop the value, so there the words go into the label itself. An empty box says what it is for, not its placeholder as a value.
  let readingProps: Record<string, unknown> = {};
  if (Platform.OS !== 'web') {
    const hint = empty ? (placeholder ?? caption) : caption;
    readingProps =
      Platform.OS === 'android' && !empty
        ? { accessibilityLabel: `${label}, ${value}`, accessibilityHint: hint }
        : { accessibilityLabel: label, accessibilityValue: { text: value }, accessibilityHint: hint };
    if (caption) {
      readingProps['aria-describedby'] = captionId;
    }
  }
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
          onFocus={() => {
            donePressed.current = false;
            setFocused(true);
          }}
          onBlur={() => {
            setFocused(false);
            if (toggle && !donePressed.current) {
              setEditing(false);
              setSelection(undefined);
              // Not on web: a click elsewhere must keep the focus it went to.
              setRefocusText(Platform.OS !== 'web');
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
        <Text ref={readingRef} style={[styles.box, font, boxStyle, empty && placeholder ? styles.placeholder : undefined]} accessible {...readingProps}>
          {empty ? placeholder : value}
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
