import { useRef, useState } from 'react';
import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import type { ComponentRef } from 'react';
import { AccessibilityInfo, findNodeHandle, Platform, Pressable, StyleSheet, View } from 'react-native';
import { formatPassingDate, parseCompleteDate } from '@griever/shared';
import { Button, SerifText as Text } from '../ui';
import { colors, radius, spacing } from '@griever/tokens';

export interface DateFieldCopy {
  datePlaceholder: string;
  dateDone: string;
  dateClear: string;
  dateHint: string;
}

interface Props {
  copy: DateFieldCopy;
  /** The stored text ("June 7, 2025"), or empty. */
  value: string;
  onChange: (value: string) => void;
  /** What a screen reader says for the control, for example "Date they passed (optional)". */
  accessibleName: string;
  /** The latest day offered, for example today. */
  maximumDate: Date;
  /** The earliest day offered. A saved date before this opens the calendar on today. */
  minimumDate: Date;
  /** A required field with no value: the same dashed border the text inputs get. */
  missing?: boolean;
}

/**
 * A date control on the setup screen (date they passed, date of birth). A real native picker, kept
 * in step with the text the session stores: Android opens its system dialog; iOS shows the calendar
 * under the field, with Done and Clear. The caller sets the latest and earliest day.
 */
export function DateField({ copy, value, onChange, accessibleName, maximumDate, minimumDate, missing }: Props) {
  const [open, setOpen] = useState(false);
  // The day the calendar shows. Set once when it opens, so it does not jump back to today.
  const [draft, setDraft] = useState(() => new Date());
  const field = useRef<ComponentRef<typeof Pressable>>(null);
  const opensOn = () => parseCompleteDate(value, { minYear: minimumDate.getFullYear() }) ?? new Date();

  const focusField = () => {
    const handle = field.current ? findNodeHandle(field.current) : null;
    if (handle) {
      AccessibilityInfo.setAccessibilityFocus(handle);
    }
  };

  // The iOS calendar only moves the draft. The value is saved on Done, so each tap does not save
  // the session and re-write the message.
  const moveDraft = (_event: unknown, date?: Date) => {
    if (date) {
      setDraft(date);
    }
  };

  const press = () => {
    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({
        value: opensOn(),
        mode: 'date',
        maximumDate,
        minimumDate,
        neutralButton: { label: copy.dateClear },
        onChange: (event, date) => {
          if (event.type === 'set' && date) {
            setDraft(date);
            onChange(formatPassingDate(date));
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

  // Done saves the day the calendar shows, even if the person never touched it.
  const done = () => {
    onChange(formatPassingDate(draft));
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
        accessibilityHint={copy.dateHint}
        accessibilityValue={{ text: value || copy.datePlaceholder }}
        accessibilityState={{ expanded: Platform.OS === 'ios' ? open : undefined }}
        style={[styles.field, missing && styles.fieldMissing]}
      >
        <Text style={value ? styles.value : styles.placeholder}>{value || copy.datePlaceholder}</Text>
      </Pressable>
      {open && Platform.OS === 'ios' ? (
        <View style={styles.picker}>
          <DateTimePicker value={draft} mode="date" display="inline" maximumDate={maximumDate} minimumDate={minimumDate} accentColor={colors['accent-700']} onChange={moveDraft} />
          <View style={styles.actions}>
            {value ? <Button label={copy.dateClear} variant="tertiary" onPress={clear} /> : null}
            <Button label={copy.dateDone} variant="secondary" onPress={done} />
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
