import { useId, useRef, useState } from 'react';
import type { ComponentRef } from 'react';
import { Platform, StyleSheet, TextInput, View } from 'react-native';
import type { TextInputProps } from 'react-native';
import { colors, radius, spacing } from '@griever/tokens';
import { Heading } from '../ui/Heading';
import { Body } from '../ui/Text';
import { useSerifStyle } from '../ui/typography';

const NAMES: Record<string, string> = {
  alabama: 'AL', alaska: 'AK', arizona: 'AZ', arkansas: 'AR', california: 'CA', colorado: 'CO', connecticut: 'CT', delaware: 'DE',
  'district of columbia': 'DC', florida: 'FL', georgia: 'GA', hawaii: 'HI', idaho: 'ID', illinois: 'IL', indiana: 'IN', iowa: 'IA',
  kansas: 'KS', kentucky: 'KY', louisiana: 'LA', maine: 'ME', maryland: 'MD', massachusetts: 'MA', michigan: 'MI', minnesota: 'MN',
  mississippi: 'MS', missouri: 'MO', montana: 'MT', nebraska: 'NE', nevada: 'NV', 'new hampshire': 'NH', 'new jersey': 'NJ',
  'new mexico': 'NM', 'new york': 'NY', 'north carolina': 'NC', 'north dakota': 'ND', ohio: 'OH', oklahoma: 'OK', oregon: 'OR',
  pennsylvania: 'PA', 'rhode island': 'RI', 'south carolina': 'SC', 'south dakota': 'SD', tennessee: 'TN', texas: 'TX', utah: 'UT',
  vermont: 'VT', virginia: 'VA', washington: 'WA', 'west virginia': 'WV', wisconsin: 'WI', wyoming: 'WY',
};

/** A full US state name becomes its two-letter code. Anything else comes back trimmed, so the shared address check can refuse it. Same rule as apps/web/src/cms/usStates.ts. */
export function stateToCode(text: string): string {
  const trimmed = text.trim();
  return NAMES[trimmed.toLowerCase().replace(/\s+/g, ' ')] ?? trimmed;
}

export interface LabelledInputProps {
  /** The visible label. */
  label: string;
  /** What a screen reader says: the label, plus "required" or "optional" when the label does not say it. */
  accessibleName: string;
  value: string;
  onChangeText: (text: string) => void;
  editable?: boolean;
  /** A calm line under the field, shown while there is no error. */
  hint?: string;
  /** The message when the value is wrong. */
  error?: string;
  returnKeyType?: TextInputProps['returnKeyType'];
  onSubmitEditing?: () => void;
  /** Codes such as the state and ZIP: no autocorrect. */
  literal?: boolean;
  autoCapitalize?: TextInputProps['autoCapitalize'];
  keyboardType?: TextInputProps['keyboardType'];
  textContentType?: TextInputProps['textContentType'];
  autoComplete?: TextInputProps['autoComplete'];
}

/** A visible label that focuses the field, the field, a hint and an error line. */
export function LabelledInput({
  label,
  accessibleName,
  value,
  onChangeText,
  editable = true,
  hint,
  error,
  returnKeyType = 'next',
  onSubmitEditing,
  literal,
  autoCapitalize = 'words',
  keyboardType,
  textContentType,
  autoComplete,
}: LabelledInputProps) {
  const font = useSerifStyle('regular');
  const labelId = useId();
  const ref = useRef<ComponentRef<typeof TextInput>>(null);
  const [focused, setFocused] = useState(false);
  return (
    <View style={styles.field}>
      <Body tone="strong" id={labelId} onPress={() => ref.current?.focus()}>
        {label}
      </Body>
      <TextInput
        ref={ref}
        style={[styles.input, font, error ? styles.inputError : null, focused && Platform.OS !== 'web' && styles.inputFocused]}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        {...webFieldHook}
        aria-labelledby={labelId}
        accessibilityLabel={accessibleName}
        textContentType={textContentType}
        autoComplete={autoComplete}
        autoCapitalize={autoCapitalize}
        autoCorrect={literal ? false : undefined}
        spellCheck={literal ? false : undefined}
        keyboardType={keyboardType}
        returnKeyType={returnKeyType}
        editable={editable}
        value={value}
        onChangeText={onChangeText}
        onSubmitEditing={onSubmitEditing}
      />
      {hint && !error ? (
        <Body tone="muted" small>
          {hint}
        </Body>
      ) : null}
      {error ? (
        <Body tone="danger" live>
          {error}
        </Body>
      ) : null}
    </View>
  );
}

export type AddressKey = 'line1' | 'line2' | 'city' | 'state' | 'zip';

export interface AddressFieldsCopy {
  addressHeading: string;
  addressHint: string;
  addressLine1Label: string;
  addressLine2Label: string;
  cityLabel: string;
  stateLabel: string;
  stateHint: string;
  zipLabel: string;
}

export interface AddressFieldsProps {
  copy: AddressFieldsCopy;
  values: Record<AddressKey, string>;
  errors: Partial<Record<AddressKey, string>>;
  onChange: (field: AddressKey, text: string) => void;
  editable?: boolean;
  /** The Go key on the last field. */
  onSubmit?: () => void;
}

/** The address group: a heading, one hint, then line 1, line 2, city, state and ZIP. */
export function AddressFields({ copy, values, errors, onChange, editable, onSubmit }: AddressFieldsProps) {
  return (
    <View style={styles.group}>
      <Heading level={2}>{copy.addressHeading}</Heading>
      <Body tone="muted" small>
        {copy.addressHint}
      </Body>
      <LabelledInput
        label={copy.addressLine1Label}
        accessibleName={copy.addressLine1Label}
        value={values.line1}
        error={errors.line1}
        editable={editable}
        textContentType="streetAddressLine1"
        autoComplete="address-line1"
        onChangeText={(text) => onChange('line1', text)}
      />
      <LabelledInput
        label={copy.addressLine2Label}
        accessibleName={copy.addressLine2Label}
        value={values.line2}
        error={errors.line2}
        editable={editable}
        textContentType="streetAddressLine2"
        autoComplete="address-line2"
        onChangeText={(text) => onChange('line2', text)}
      />
      <LabelledInput
        label={copy.cityLabel}
        accessibleName={copy.cityLabel}
        value={values.city}
        error={errors.city}
        editable={editable}
        textContentType="addressCity"
        onChangeText={(text) => onChange('city', text)}
      />
      <LabelledInput
        label={copy.stateLabel}
        accessibleName={copy.stateLabel}
        value={values.state}
        hint={copy.stateHint}
        error={errors.state}
        editable={editable}
        literal
        autoCapitalize="characters"
        textContentType="addressState"
        onChangeText={(text) => onChange('state', text)}
      />
      <LabelledInput
        label={copy.zipLabel}
        accessibleName={copy.zipLabel}
        value={values.zip}
        error={errors.zip}
        editable={editable}
        literal
        autoCapitalize="none"
        keyboardType="number-pad"
        textContentType="postalCode"
        autoComplete="postal-code"
        returnKeyType="go"
        onSubmitEditing={onSubmit}
        onChangeText={(text) => onChange('zip', text)}
      />
    </View>
  );
}

/** Web: lets apps/web/src/styles.css draw its field focus ring (data-gg-field). Ignored on native. */
const webFieldHook: Record<string, unknown> = { dataSet: { ggField: 'true' } };

const styles = StyleSheet.create({
  group: { gap: spacing[3] },
  field: { gap: spacing[1] },
  input: {
    minHeight: 44,
    padding: spacing[2],
    borderWidth: 1,
    borderColor: colors['neutral-600'],
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    color: colors.ink,
    fontSize: 15,
  },
  // A wrong value also gets a message below; the border is only a second cue.
  inputError: { borderColor: '#b91c1c' },
  // Native focus cue (web draws its own ring through data-gg-field).
  inputFocused: { borderColor: colors['accent-700'], borderWidth: 2 },
});
