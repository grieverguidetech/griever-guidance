import { StyleSheet, TextInput, View } from 'react-native';
import { SerifText as Text } from '@griever/ui';
import { colors, radius, spacing } from '@griever/tokens';
import { ACCENT } from './colors';

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

/** Small single-line inputs for the template's fields. Each label is also the screen-reader name. */
export function DetailsRow({ copy, fields, values, onChange }: Props) {
  return (
    <View style={styles.row}>
      <Text style={styles.heading} accessibilityRole="header">
        {copy.detailsHeading}
      </Text>
      {fields.map((field) => {
        const missing = isMissing(field, values);
        return (
          <View key={field.key} style={styles.field}>
            <Text style={styles.label}>{field.label}</Text>
            <TextInput
              style={[styles.input, missing && styles.inputMissing]}
              accessibilityLabel={field.label}
              placeholder={field.placeholder}
              placeholderTextColor={colors['neutral-600']}
              value={values[field.key] ?? ''}
              onChangeText={(text) => onChange(field.key, text)}
            />
            {missing && <Text style={styles.needed}>{copy.detailsNeeded}</Text>}
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
  inputMissing: { borderColor: ACCENT, borderWidth: 2 },
  needed: { fontSize: 13, color: colors.ink },
});
