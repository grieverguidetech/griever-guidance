import { useRef, useState } from 'react';
import type { ComponentRef } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';
import { SerifText as Text } from '@griever/ui';
import { colors, radius, spacing } from '@griever/tokens';

export interface DetailsField {
  key: string;
  label: string;
  placeholder: string;
  required: boolean;
}

export interface DetailsCopy {
  detailsHeading: string;
  detailsNeeded: string;
}

interface Props {
  copy: DetailsCopy;
  fields: DetailsField[];
  values: Record<string, string>;
  onChange: (key: string, value: string) => void;
}

/** True when a required field has no text. The caller uses it to block Send. */
export function isMissing(field: DetailsField, values: Record<string, string>) {
  return field.required && (values[field.key] ?? '').trim() === '';
}

/**
 * Small single-line inputs for the template's fields. One screen-reader stop per field: the input
 * carries the label (plus "Needed" when empty and required); the visible label is hidden from it.
 */
export function DetailsRow({ copy, fields, values, onChange }: Props) {
  const inputs = useRef<Array<ComponentRef<typeof TextInput> | null>>([]);
  const [focusedKey, setFocusedKey] = useState<string | null>(null);
  return (
    <View style={styles.row}>
      <Text style={styles.heading} accessibilityRole="header">
        {copy.detailsHeading}
      </Text>
      {fields.map((field, index) => {
        const missing = isMissing(field, values);
        const last = index === fields.length - 1;
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
                missing && styles.inputMissing,
                focusedKey === field.key && styles.inputFocused,
              ]}
              accessibilityLabel={missing ? `${field.label}, ${copy.detailsNeeded}` : field.label}
              placeholder={field.placeholder}
              placeholderTextColor={colors['neutral-700']}
              value={values[field.key] ?? ''}
              onChangeText={(text) => onChange(field.key, text)}
              onFocus={() => setFocusedKey(field.key)}
              onBlur={() => setFocusedKey(null)}
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
  label: { fontSize: 14, color: colors.ink },
  input: {
    minHeight: 44,
    paddingHorizontal: spacing[2],
    borderWidth: 1,
    borderColor: colors['neutral-600'],
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    color: colors.ink,
    fontSize: 14,
  },
  // Missing: dashed border plus the "Needed" text. Focus: a solid 2px accent border, so the two never look alike.
  inputMissing: { borderStyle: 'dashed', borderColor: colors.ink },
  inputFocused: { borderStyle: 'solid', borderColor: colors['accent-700'], borderWidth: 2 },
  needed: { fontSize: 13, color: colors.ink },
});
