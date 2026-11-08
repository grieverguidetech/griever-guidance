import { useRef, useState } from 'react';
import type { ComponentRef, Ref } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';
import type { Text as RNText } from 'react-native';
import { screenCopy } from '@griever/copy';
import { SerifText as Text } from '../ui';
import { DateField } from './DateField';
import { TimeField } from './TimeField';
import type { TimeFieldCopy } from './TimeField';
import { colors, radius, spacing } from '@griever/tokens';

export interface DetailsField {
  key: string;
  label: string;
  placeholder: string;
  required: boolean;
  /** A longer free-text answer: a taller box that wraps. */
  multiline?: boolean;
}

const dateCopy = screenCopy('personSetup');
const detailsCopy = screenCopy('phoneDetails');
/** The service date is the one field written as a date, in the text web writes ("June 7, 2025"). */
const DATE_KEY = 'serviceDate';
/** The service time is written as time text, in the text web writes ("2:00 PM"). */
const TIME_KEY = 'serviceTime';
// The Done label matches the date field's.
const TIME_COPY: Omit<TimeFieldCopy, 'placeholder'> = { done: dateCopy.dateDone, clear: detailsCopy.timeClear, hint: detailsCopy.timeHint };
// Same range as parseCompleteDate, which reads the text back. There is no real upper limit.
const EARLIEST_DATE = new Date(2000, 0, 1);
const LATEST_DATE = new Date(2100, 11, 31);

export interface DetailsCopy {
  detailsHeading: string;
  detailsNeeded: string;
}

interface Props {
  copy: DetailsCopy;
  fields: DetailsField[];
  values: Record<string, string>;
  onChange: (key: string, value: string) => void;
  /** For moving the screen reader to the heading when the row opens. */
  headingRef?: Ref<ComponentRef<typeof RNText>>;
}

/** True when a required field has no text. The caller uses it to block Send. */
export function isMissing(field: DetailsField, values: Record<string, string>) {
  return field.required && (values[field.key] ?? '').trim() === '';
}

/**
 * Small single-line inputs for the template's fields. One screen-reader stop per field: the input
 * carries the label (plus "Needed" when empty and required); the visible label is hidden from it.
 */
export function DetailsRow({ copy, fields, values, onChange, headingRef }: Props) {
  const inputs = useRef<Array<ComponentRef<typeof TextInput> | null>>([]);
  const [focusedKey, setFocusedKey] = useState<string | null>(null);
  return (
    <View style={styles.row}>
      <Text ref={headingRef} style={styles.heading} accessibilityRole="header">
        {copy.detailsHeading}
      </Text>
      {fields.map((field, index) => {
        const missing = isMissing(field, values);
        const last = index === fields.length - 1;
        const accessibleName = missing ? `${field.label}, ${copy.detailsNeeded}` : field.label;
        if (field.key === DATE_KEY) {
          return (
            <View key={field.key} style={styles.field}>
              <Text style={styles.label} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
                {field.label}
              </Text>
              <DateField
                copy={dateCopy}
                value={values[field.key] ?? ''}
                onChange={(text) => onChange(field.key, text)}
                accessibleName={accessibleName}
                maximumDate={LATEST_DATE}
                minimumDate={EARLIEST_DATE}
                missing={missing}
              />
              {missing && (
                <Text style={styles.needed} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
                  {copy.detailsNeeded}
                </Text>
              )}
            </View>
          );
        }
        if (field.key === TIME_KEY) {
          return (
            <View key={field.key} style={styles.field}>
              <Text style={styles.label} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
                {field.label}
              </Text>
              <TimeField
                copy={{ ...TIME_COPY, placeholder: field.placeholder }}
                value={values[field.key] ?? ''}
                onChange={(text) => onChange(field.key, text)}
                accessibleName={accessibleName}
                missing={missing}
              />
              {missing && (
                <Text style={styles.needed} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
                  {copy.detailsNeeded}
                </Text>
              )}
            </View>
          );
        }
        return (
          <View key={field.key} style={styles.field}>
            <Text style={styles.label} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
              {field.label}
            </Text>
            <TextInput
              ref={(node) => {
                inputs.current[index] = node;
              }}
              style={[
                styles.input,
                field.multiline && styles.inputMultiline,
                missing && styles.inputMissing,
                focusedKey === field.key && styles.inputFocused,
              ]}
              accessibilityLabel={accessibleName}
              placeholder={field.placeholder}
              placeholderTextColor={colors['neutral-700']}
              value={values[field.key] ?? ''}
              onChangeText={(text) => onChange(field.key, text)}
              onFocus={() => setFocusedKey(field.key)}
              onBlur={() => setFocusedKey(null)}
              multiline={field.multiline}
              numberOfLines={field.multiline ? 3 : undefined}
              returnKeyType={last ? 'done' : 'next'}
              blurOnSubmit={last}
              onSubmitEditing={() => {
                if (!last) {
                  inputs.current[index + 1]?.focus();
                }
              }}
            />
            {missing && (
              <Text style={styles.needed} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
                {copy.detailsNeeded}
              </Text>
            )}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { gap: spacing[2] },
  heading: { fontSize: 16, color: colors.ink },
  field: { gap: spacing[1] },
  label: { fontSize: 15, color: colors.ink },
  input: {
    minHeight: 44,
    paddingHorizontal: spacing[2],
    borderWidth: 1,
    borderColor: colors['neutral-600'],
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    color: colors.ink,
    fontSize: 15,
  },
  inputMultiline: { minHeight: 88, textAlignVertical: 'top', paddingVertical: spacing[2] },
  // Missing: dashed border plus the "Needed" text. Focus: a solid 2px accent border, so the two never look alike.
  inputMissing: { borderStyle: 'dashed', borderColor: colors.ink },
  inputFocused: { borderStyle: 'solid', borderColor: colors['accent-700'], borderWidth: 2 },
  needed: { fontSize: 15, color: colors.ink },
});
