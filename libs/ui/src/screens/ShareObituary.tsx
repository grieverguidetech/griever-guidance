import { useId, useRef, useState } from 'react';
import type { ComponentRef, Ref } from 'react';
import { Platform, StyleSheet, Text, TextInput, View } from 'react-native';
import { colors, radius, spacing } from '@griever/tokens';
import { Button } from '../Button';
import type { ButtonNode } from '../Button';
import { Card } from '../Card';
import { Heading } from '../Heading';
import type { HeadingProps } from '../Heading';
import { applyUrlInputMode } from '../inputMode';
import { Status } from '../Status';
import { Body, Eyebrow } from '../Text';
import { useSerifStyle } from '../typography';

/** The words the screen needs. libs/copy/screens/shareObituary.json has these keys, plus more. */
export interface ShareObituaryCopy {
  heading: string;
  intro: string;
  back: string;
  checklist: string;
  linkLabel: string;
  linkPlaceholder: string;
  publisherLabel: string;
  optional: string;
  publisherPlaceholder: string;
  previewKicker: string;
  continue: string;
  /** Why Continue is unavailable while the link is empty. */
  needLink: string;
  /** The error under the link field, and why Continue is unavailable for a bad link. */
  invalidLink: string;
  waiting: string;
  draftTitle: string;
  draftBody: string;
  draftButton: string;
}

export interface ShareObituaryProps {
  copy: ShareObituaryCopy;
  /** The eyebrow line, for example "For Margaret". */
  eyebrow: string;
  eyebrowTone?: 'accent' | 'accent2';
  link: string;
  onLinkChange: (link: string) => void;
  /** The app's link rule (isValidObituaryLink in libs/shared) applied to `link`. */
  linkValid: boolean;
  publisher: string;
  onPublisherChange: (publisher: string) => void;
  /** "What we'll send", already built. Leave unset to hide the card. */
  preview?: string;
  onBack: () => void;
  onWhatYoullNeed: () => void;
  onContinue: () => void;
  /** Opens drafting. Leave unset to hide the "Not written yet?" card. */
  onDraft?: () => void;
  /** With `onDraft`: the draft button is unavailable, for this reason (already worded). */
  draftUnavailable?: string;
  headingRef?: HeadingProps['headingRef'];
  /** For the sheet that "What you'll need" opens to return focus to. */
  checklistRef?: Ref<ButtonNode>;
}

/**
 * "Has the obituary been published?": takes the link (and where it ran), checks it, and moves on to
 * "Who should know?". Built from libs/ui so web (through react-native-web) and mobile show the same
 * screen. The link lives in the app; only whether the field has been left or Continue pressed lives here.
 */
export function ShareObituary({ copy, eyebrow, eyebrowTone, link, onLinkChange, linkValid, publisher, onPublisherChange, preview, onBack, onWhatYoullNeed, onContinue, onDraft, draftUnavailable, headingRef, checklistRef }: ShareObituaryProps) {
  // A link that was saved earlier and is not good shows its error at once; a link being typed waits until the field is left.
  const [touched, setTouched] = useState(() => link.trim() !== '' && !linkValid);
  const errorId = useId();
  const reasonId = useId();
  const draftReasonId = useId();
  const empty = link.trim() === '';
  const showError = touched && !empty && !linkValid;
  const reason = empty ? copy.needLink : undefined;
  const blockedBy = reason ?? (linkValid ? undefined : copy.invalidLink);

  return (
    <View style={styles.screen}>
      <View style={styles.topBar}>
        <Button label={copy.back} variant="tertiary" onPress={onBack} />
        <Button label={copy.checklist} variant="tertiary" outlined opensDialog onPress={onWhatYoullNeed} buttonRef={checklistRef} />
      </View>
      <View style={styles.head}>
        <Eyebrow tone={eyebrowTone}>{eyebrow}</Eyebrow>
        <Heading level={1} headingRef={headingRef}>
          {copy.heading}
        </Heading>
        <Body tone="muted">{copy.intro}</Body>
      </View>
      <Field
        label={copy.linkLabel}
        accessibleName={copy.linkLabel}
        placeholder={copy.linkPlaceholder}
        value={link}
        onChangeText={onLinkChange}
        onBlur={() => setTouched(true)}
        invalid={showError}
        describedBy={showError ? errorId : undefined}
        hint={showError ? copy.invalidLink : undefined}
        url
        returnKeyType="next"
      />
      <Status id={errorId} message={showError ? copy.invalidLink : undefined} tone="danger" />
      <Field
        label={copy.publisherLabel}
        optional={copy.optional}
        accessibleName={`${copy.publisherLabel} ${copy.optional}`}
        placeholder={copy.publisherPlaceholder}
        value={publisher}
        onChangeText={onPublisherChange}
        returnKeyType="done"
      />
      {preview ? (
        <Card>
          <Body tone="muted" small>
            {copy.previewKicker}
          </Body>
          <Body>{preview}</Body>
        </Card>
      ) : null}
      <Button
        label={copy.continue}
        ariaDisabled={!linkValid}
        announceDisabled
        describedBy={reason ? reasonId : showError ? errorId : undefined}
        hint={blockedBy}
        onPress={() => {
          if (linkValid) {
            onContinue();
          } else {
            setTouched(true);
          }
        }}
      />
      <Status id={reasonId} message={reason} />
      <Body tone="muted" small>
        {copy.waiting}
      </Body>
      {onDraft ? (
        <Card>
          <Body tone="strong">{copy.draftTitle}</Body>
          <Body tone="muted">{copy.draftBody}</Body>
          <Button
            label={copy.draftButton}
            variant="secondary"
            ariaDisabled={draftUnavailable !== undefined}
            announceDisabled
            describedBy={draftUnavailable ? draftReasonId : undefined}
            hint={draftUnavailable}
            onPress={() => {
              if (draftUnavailable === undefined) {
                onDraft();
              }
            }}
          />
          <Status id={draftReasonId} message={draftUnavailable} />
        </Card>
      ) : null}
    </View>
  );
}

/** Web: lets apps/web/src/styles.css draw its field focus ring (data-gg-field). Ignored on native. */
const webFieldHook: Record<string, unknown> = { dataSet: { ggField: 'true' } };

interface FieldProps {
  label: string;
  optional?: string;
  /** The name native reads (web names the field from the visible label). */
  accessibleName: string;
  placeholder: string;
  value: string;
  onChangeText: (value: string) => void;
  onBlur?: () => void;
  invalid?: boolean;
  describedBy?: string;
  /** Native: read after the label (accessibilityHint). */
  hint?: string;
  url?: boolean;
  returnKeyType: 'next' | 'done';
}

function Field({ label, optional, accessibleName, placeholder, value, onChangeText, onBlur, invalid, describedBy, hint, url, returnKeyType }: FieldProps) {
  const font = useSerifStyle('regular');
  const labelId = useId();
  const [focused, setFocused] = useState(false);
  const input = useRef<ComponentRef<typeof TextInput> | null>(null);
  return (
    <View style={styles.field}>
      <Body tone="strong" id={labelId} onPress={() => input.current?.focus()}>
        {label} {optional ? <Text style={styles.optional}>{optional}</Text> : null}
      </Body>
      <TextInput
        ref={(node) => {
          input.current = node;
          if (url) {
            applyUrlInputMode(node);
          }
        }}
        style={[styles.input, font, focused && Platform.OS !== 'web' && styles.inputFocused, invalid && styles.inputInvalid]}
        onFocus={() => setFocused(true)}
        onBlur={() => {
          setFocused(false);
          onBlur?.();
        }}
        {...webFieldHook}
        // Web names the field from the visible label; native reads the label text directly.
        aria-labelledby={labelId}
        accessibilityLabel={accessibleName}
        aria-invalid={invalid ? true : undefined}
        aria-describedby={describedBy}
        accessibilityHint={hint}
        returnKeyType={returnKeyType}
        autoCapitalize="none"
        autoCorrect={false}
        // Not on web: a url input there adds the browser's own invalid state on top of ours.
        keyboardType={url && Platform.OS !== 'web' ? 'url' : 'default'}
        placeholder={placeholder}
        placeholderTextColor={colors['neutral-700']}
        value={value}
        onChangeText={onChangeText}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { gap: spacing[3] },
  topBar: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center' },
  head: { gap: spacing[1] },
  field: { gap: spacing[1] },
  optional: { color: colors['neutral-700'], fontWeight: '400' },
  input: {
    minHeight: 44,
    padding: spacing[2],
    borderWidth: 1,
    borderColor: colors['neutral-600'],
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    color: colors.ink,
    fontSize: 14,
  },
  // Last, so an invalid field keeps its error border while it has focus.
  inputInvalid: { borderColor: '#b91c1c', borderWidth: 2 },
  // Native focus cue (web draws its own ring through data-gg-field).
  inputFocused: { borderColor: colors['accent-700'], borderWidth: 2 },
});
