import { useState } from 'react';
import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import { formatPassingDate, passingDateFromText } from '@griever/shared';
import { Button, SerifText as Text } from '@griever/ui';
import { colors, radius, spacing } from '@griever/tokens';

export interface PassingDateCopy {
  datePlaceholder: string;
  dateDone: string;
  dateClear: string;
}

interface Props {
  copy: PassingDateCopy;
  /** The stored text ("June 7, 2025"), or empty. */
  value: string;
  onChange: (value: string) => void;
  /** What a screen reader says for the control, for example "Date they passed (optional)". */
  accessibleName: string;
}

/**
 * The date control on the setup screen. A real native picker, kept in step with the text the
 * session stores: Android opens its system dialog; iOS shows the calendar under the field, with
 * Done and Clear. No day after today can be chosen.
 */
export function PassingDateField({ copy, value, onChange, accessibleName }: Props) {
  const [open, setOpen] = useState(false);
  const opensOn = passingDateFromText(value) ?? new Date();

  const pick = (_event: unknown, date?: Date) => {
    if (date) {
      onChange(formatPassingDate(date));
    }
  };

  const press = () => {
    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({
        value: opensOn,
        mode: 'date',
        maximumDate: new Date(),
        onChange: (event, date) => {
          if (event.type === 'set') {
            pick(event, date);
          }
        },
      });
      return;
    }
    setOpen(!open);
  };

  return (
    <View style={styles.wrap}>
      <Pressable
        onPress={press}
        accessibilityRole="button"
        accessibilityLabel={accessibleName}
        accessibilityValue={{ text: value || copy.datePlaceholder }}
        accessibilityState={{ expanded: Platform.OS === 'ios' ? open : undefined }}
        style={styles.field}
      >
        <Text style={value ? styles.value : styles.placeholder}>{value || copy.datePlaceholder}</Text>
      </Pressable>
      {open && Platform.OS === 'ios' ? (
        <View style={styles.picker}>
          <DateTimePicker value={opensOn} mode="date" display="inline" maximumDate={new Date()} accentColor={colors['accent-700']} onChange={pick} />
          <View style={styles.actions}>
            {value ? (
              <Button
                label={copy.dateClear}
                variant="tertiary"
                onPress={() => {
                  onChange('');
                  setOpen(false);
                }}
              />
            ) : null}
            <Button label={copy.dateDone} variant="secondary" onPress={() => setOpen(false)} />
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
  value: { fontSize: 14, color: colors.ink },
  placeholder: { fontSize: 14, color: colors['neutral-700'] },
  picker: { gap: spacing[1] },
  actions: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-end', gap: spacing[1] },
});
