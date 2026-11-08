import { useRef, useState } from 'react';
import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import type { ComponentRef } from 'react';
import { AccessibilityInfo, findNodeHandle, Platform, Pressable, StyleSheet, View } from 'react-native';
import { formatServiceTime, serviceTimeFromText } from '@griever/shared';
import { Button, SerifText as Text } from '../ui';
import { colors, radius, spacing } from '@griever/tokens';

export interface TimeFieldCopy {
  placeholder: string;
  done: string;
  clear: string;
  hint: string;
}

interface Props {
  copy: TimeFieldCopy;
  /** The stored text ("2:00 PM"), or empty. A text the picker cannot read is shown as typed. */
  value: string;
  onChange: (value: string) => void;
  /** What a screen reader says for the control, for example "Time". */
  accessibleName: string;
  /** A required field with no value: the same dashed border the text inputs get. */
  missing?: boolean;
}

/**
 * A time control for the service Details row. Same pattern as DateField: Android opens its system
 * time dialog; iOS shows the spinner under the field, with Done and Clear. Writes "2:00 PM", the
 * text web writes.
 */
export function TimeField({ copy, value, onChange, accessibleName, missing }: Props) {
  const [open, setOpen] = useState(false);
  // The time the spinner shows. Set once when it opens, so it does not jump back to now.
  const [draft, setDraft] = useState(() => new Date());
  const field = useRef<ComponentRef<typeof Pressable>>(null);
  const opensOn = () => serviceTimeFromText(value) ?? new Date();

  const focusField = () => {
    const handle = field.current ? findNodeHandle(field.current) : null;
    if (handle) {
      AccessibilityInfo.setAccessibilityFocus(handle);
    }
  };

  // The iOS spinner only moves the draft. The value is saved on Done.
  const moveDraft = (_event: unknown, date?: Date) => {
    if (date) {
      setDraft(date);
    }
  };

  const press = () => {
    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({
        value: opensOn(),
        mode: 'time',
        is24Hour: false,
        neutralButton: { label: copy.clear },
        onChange: (event, date) => {
          if (event.type === 'set' && date) {
            setDraft(date);
            onChange(formatServiceTime(date));
          } else if (event.type === 'neutralButtonPressed') {
            onChange('');
          }
        },
      });
      return;
    }
    if (!open) {
      setDraft(opensOn());
    }
    setOpen(!open);
  };

  // Done saves the time the spinner shows, even if the person never touched it.
  const done = () => {
    onChange(formatServiceTime(draft));
    setOpen(false);
    focusField();
  };

  const clear = () => {
    onChange('');
    setOpen(false);
    focusField();
  };

  return (
    <View style={styles.wrap}>
      <Pressable
        ref={field}
        onPress={press}
        accessibilityRole="button"
        accessibilityLabel={accessibleName}
        accessibilityHint={copy.hint}
        accessibilityValue={{ text: value || copy.placeholder }}
        accessibilityState={{ expanded: Platform.OS === 'ios' ? open : undefined }}
        style={[styles.field, missing && styles.fieldMissing]}
      >
        <Text style={value ? styles.value : styles.placeholder}>{value || copy.placeholder}</Text>
      </Pressable>
      {open && Platform.OS === 'ios' ? (
        <View style={styles.picker}>
          <DateTimePicker value={draft} mode="time" display="spinner" is24Hour={false} accentColor={colors['accent-700']} onChange={moveDraft} />
          <View style={styles.actions}>
            {value ? <Button label={copy.clear} variant="tertiary" onPress={clear} /> : null}
            <Button label={copy.done} variant="secondary" onPress={done} />
          </View>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing[1] },
  field: {
    minHeight: 44,
    justifyContent: 'center',
    padding: spacing[2],
    borderWidth: 1,
    borderColor: colors['neutral-600'],
    borderRadius: radius.md,
    backgroundColor: colors.surface,
  },
  fieldMissing: { borderStyle: 'dashed', borderColor: colors.ink },
  value: { fontSize: 15, color: colors.ink },
  placeholder: { fontSize: 15, color: colors['neutral-700'] },
  picker: { gap: spacing[1] },
  actions: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-end', gap: spacing[1] },
});
