import { forwardRef, useEffect, useRef, useState } from 'react';
import type { ComponentRef, ForwardRefExoticComponent, ForwardedRef, RefAttributes } from 'react';
import { AccessibilityInfo, findNodeHandle, Platform, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { fill } from '@griever/copy';
import { newPlaceSessionToken, placeDetails, suggestPlaces } from '@griever/api-client';
import { SERVICE_PLACE_TYPES } from '@griever/shared';
import type { PlaceDetails, PlaceSuggestion } from '@griever/shared';
import { colors, radius, spacing } from '@griever/tokens';
import { SerifText as Text } from '../ui';

export const PLACE_DEBOUNCE_MS = 300;
export const PLACE_MIN_CHARS = 3;

export interface PlaceFieldCopy {
  placesOne: string;
  placesMany: string;
  placesNone: string;
  placesUnavailable: string;
  placeFilled: string;
  placesHint: string;
}

/** The calls the field makes. Tests pass a fake; the app uses the gateway client. */
export interface PlacesClient {
  suggest: (input: string, types: readonly string[], token: string) => Promise<PlaceSuggestion[]>;
  details: (placeId: string, token: string) => Promise<PlaceDetails>;
  newToken: () => string;
}

const gatewayClient: PlacesClient = { suggest: suggestPlaces, details: placeDetails, newToken: newPlaceSessionToken };

interface Props {
  copy: PlaceFieldCopy;
  value: string;
  onChange: (value: string) => void;
  accessibleName: string;
  placeholder: string;
  /** A required field with no value: the same dashed border the other inputs get. */
  missing?: boolean;
  returnKeyType?: 'next' | 'done';
  onSubmitEditing?: () => void;
  client?: PlacesClient;
}

function countText(copy: PlaceFieldCopy, count: number): string {
  if (count === 0) {
    return copy.placesNone;
  }
  return count === 1 ? copy.placesOne : fill(copy.placesMany, { count });
}

/** "{name}, {address}", the text web writes for a pick. */
function pickedText(suggestion: PlaceSuggestion, details: PlaceDetails): string {
  // Never write "…, undefined" if the answer is not the shape we expect.
  if (typeof details.address !== 'string' || details.address.trim() === '') {
    return suggestion.text;
  }
  return `${(typeof details.name === 'string' ? details.name.trim() : '') || suggestion.mainText}, ${details.address}`;
}

/** What a screen reader says for a suggestion row. */
function rowName(suggestion: PlaceSuggestion): string {
  return suggestion.secondaryText ? `${suggestion.mainText}, ${suggestion.secondaryText}` : suggestion.mainText;
}

/**
 * The service Location input with place suggestions under it. The typed text is always the value.
 * Suggestions only help: on any failure the field stays a plain text box and one calm line says why.
 * The list is plain views, not a Modal, so nothing opens or flips without a tap.
 */
function PlaceFieldBase(
  { copy, value, onChange, accessibleName, placeholder, missing, returnKeyType, onSubmitEditing, client = gatewayClient }: Props,
  forwardedRef: ForwardedRef<ComponentRef<typeof TextInput>>,
) {
  const inputRef = useRef<ComponentRef<typeof TextInput> | null>(null);
  const setInputRef = (node: ComponentRef<typeof TextInput> | null) => {
    inputRef.current = node;
    if (typeof forwardedRef === 'function') {
      forwardedRef(node);
    } else if (forwardedRef) {
      forwardedRef.current = node;
    }
  };
  const [focused, setFocused] = useState(false);
  const [options, setOptions] = useState<PlaceSuggestion[]>([]);
  const [status, setStatus] = useState('');
  // Once a search fails the field stops asking for the rest of this visit, so a missing key or a
  // rate limit is not hit again on every keystroke.
  const [unavailable, setUnavailable] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Bumped on every keystroke and pick, so an answer for old text is dropped.
  const ticket = useRef(0);
  // One token per run of typing; it ends on a pick or when the text gets too short.
  const token = useRef<string | null>(null);
  const clientRef = useRef(client);
  clientRef.current = client;

  useEffect(
    () => () => {
      ticket.current += 1;
      if (timer.current) {
        clearTimeout(timer.current);
      }
    },
    [],
  );

  const say = (text: string) => {
    setStatus(text);
    // Android reads the live region. iOS needs the explicit announcement.
    if (text && Platform.OS === 'ios') {
      AccessibilityInfo.announceForAccessibility(text);
    }
  };

  const search = async (text: string, mine: number) => {
    try {
      token.current ??= clientRef.current.newToken();
      const found = await clientRef.current.suggest(text, SERVICE_PLACE_TYPES, token.current);
      if (mine !== ticket.current) {
        return;
      }
      const shown = found.slice(0, 5);
      setOptions(shown);
      say(countText(copy, shown.length));
    } catch {
      // Intended: a failure for text the user has since changed is dropped, so the next keystroke retries.
      if (mine !== ticket.current) {
        return;
      }
      setOptions([]);
      setUnavailable(true);
      say(copy.placesUnavailable);
    }
  };

  const type = (text: string) => {
    onChange(text);
    ticket.current += 1;
    if (timer.current) {
      clearTimeout(timer.current);
    }
    const trimmed = text.trim();
    if (unavailable || trimmed.length < PLACE_MIN_CHARS) {
      setOptions([]);
      if (!unavailable) {
        setStatus('');
        token.current = null;
      }
      return;
    }
    const mine = ticket.current;
    timer.current = setTimeout(() => void search(trimmed, mine), PLACE_DEBOUNCE_MS);
  };

  const pick = async (suggestion: PlaceSuggestion) => {
    ticket.current += 1;
    const mine = ticket.current;
    const sessionToken = token.current ?? clientRef.current.newToken();
    token.current = null;
    setOptions([]);
    let text = suggestion.text;
    try {
      text = pickedText(suggestion, await clientRef.current.details(suggestion.id, sessionToken));
    } catch {
      // The suggestion's own line is still a good answer.
    }
    // Intended: typing after the tap wins, so a late pick never overwrites what the user is typing now.
    if (mine !== ticket.current) {
      return;
    }
    onChange(text);
    // Hand focus back to the input so the screen reader moves off the removed row and reads the status.
    inputRef.current?.focus();
    const handle = inputRef.current ? findNodeHandle(inputRef.current) : null;
    if (handle) {
      AccessibilityInfo.setAccessibilityFocus(handle);
    }
    say(copy.placeFilled);
  };

  return (
    <View style={styles.wrap}>
      <TextInput
        ref={setInputRef}
        accessibilityHint={copy.placesHint}
        style={[styles.input, missing && styles.inputMissing, focused && styles.inputFocused]}
        accessibilityLabel={accessibleName}
        placeholder={placeholder}
        placeholderTextColor={colors['neutral-700']}
        value={value}
        onChangeText={type}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        returnKeyType={returnKeyType}
        onSubmitEditing={onSubmitEditing}
      />
      {options.length > 0 && (
        <View style={styles.list}>
          {options.map((option) => (
            <Pressable
              key={option.id}
              accessibilityRole="button"
              accessibilityLabel={rowName(option)}
              onPress={() => void pick(option)}
              style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
            >
              <Text style={styles.rowText}>
                <Text style={styles.rowName}>{option.mainText}</Text>
                {option.secondaryText ? `, ${option.secondaryText}` : ''}
              </Text>
            </Pressable>
          ))}
        </View>
      )}
      {status !== '' && (
        <Text style={styles.status} accessibilityLiveRegion="polite">
          {status}
        </Text>
      )}
    </View>
  );
}

export const PlaceField: ForwardRefExoticComponent<Props & RefAttributes<ComponentRef<typeof TextInput>>> = forwardRef(PlaceFieldBase);

const styles = StyleSheet.create({
  wrap: { gap: spacing[1] },
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
  inputMissing: { borderStyle: 'dashed', borderColor: colors.ink },
  inputFocused: { borderStyle: 'solid', borderColor: colors['accent-700'], borderWidth: 2 },
  list: { borderWidth: 1, borderColor: colors['neutral-600'], borderRadius: radius.md, backgroundColor: colors.surface, overflow: 'hidden' },
  row: { minHeight: 44, justifyContent: 'center', paddingHorizontal: spacing[2], paddingVertical: spacing[1] },
  rowPressed: { backgroundColor: colors['neutral-200'] },
  rowText: { fontSize: 15, color: colors.ink },
  rowName: { fontSize: 15, color: colors.ink, fontWeight: '700' },
  status: { fontSize: 15, color: colors['neutral-700'] },
});
