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
  /** Mobile step 1 (all optional; web leaves them out). */
  emailTitle?: string;
  emailBody?: string;
  emailButton?: string;
  /** Shown instead of the button when there is no obituary text yet. */
  emailNoText?: string;
  /** Shown under the button when neither mail nor sharing could open. */
  emailFailed?: string;
  /** Muted line after mail or the share sheet opened. */
  emailOpened?: string;
  /** Step 1 "Copy the text" button, and the line after it worked. */
  copyButton?: string;
  copied?: string;
  /** Calm line when the phone refused the copy. */
  copyFailed?: string;
  /** Muted line after the share sheet completed (mail did not open). */
  emailShared?: string;
  /** Link paste feedback lines. */
  pasteNotLink?: string;
  pasteEmpty?: string;
  pasted?: string;
  /** The obituary text card (mobile, from libs/copy/screens/phoneObituary.json). All optional; the card shows only with `textEditor`. */
  textTitle?: string;
  editHelp?: string;
  editButton?: string;
  /** The same button when there is no text yet. */
  writeButton?: string;
  editLabel?: string;
  editPlaceholder?: string;
  saveButton?: string;
  cancelButton?: string;
  saved?: string;
  /** The optional publisher address field in step 1 (mobile, from phoneObituary.json). */
  publisherEmailLabel?: string;
  publisherEmailPlaceholder?: string;
  /** Muted line under the field: where the address is kept. */
  publisherEmailHint?: string;
  /** Label above the link field (mobile "Step 2: ..."). */
  linkStepLabel?: string;
  /** "Paste link" beside the link field. */
  pasteButton?: string;
}

/** Step 1 of the obituary on the phone: email the text to the paper or funeral home. */
export interface PublisherEmail {
  /** false when no obituary text has been written yet: a calm line shows, nothing is blocked. */
  hasText: boolean;
  onPress: () => void;
  /** true after mail and sharing both failed. */
  failed?: boolean;
  /** true while the press is running: the button reads as busy and a second tap does nothing. */
  busy?: boolean;
  /** Which calm line follows a press: mail opened, or the share sheet completed. Unset: no line. */
  note?: 'opened' | 'shared';
  /** The typed publisher address. Leave unset to hide the field. */
  address?: {
    value: string;
    onChange: (value: string) => void;
    onBlur: () => void;
    /** The calm refusal (already worded), shown under the field. Unset when the address is fine or empty. */
    error?: string;
  };
  /** Copies the obituary text. Leave unset to hide "Copy the text". */
  onCopyText?: () => void;
  /** true after the text was copied. */
  copied?: boolean;
  /** true when the phone refused the copy. */
  copyFailed?: boolean;
}

/** The obituary text on the phone: shown as plain text, or edited in one multiline box. */
export interface ObituaryTextEditor {
  /** The saved text (or the draft built from the details). Empty when there is none. */
  text: string;
  editing: boolean;
  /** What is in the box while editing. Kept by the screen, so closing the keyboard loses nothing. */
  value: string;
  onValueChange: (value: string) => void;
  onEdit: () => void;
  onSave: () => void;
  onCancel: () => void;
  /** The longest text the app keeps (libs/shared), so a save is never cut after the fact. */
  maxLength?: number;
  /** true right after a save: a calm line is announced. */
  saved?: boolean;
  /** For returning screen-reader focus to the Edit button after Save or Cancel. */
  editRef?: Ref<ButtonNode>;
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
  /** Fills the link field from the clipboard (mobile). Leave unset to hide "Paste link". */
  onPasteLink?: () => void;
  /** The line after a paste press (already worded). Announced politely. */
  pasteMessage?: string;
  /** With `onDraft`: the draft button is unavailable, for this reason (already worded). */
  draftUnavailable?: string;
  /** The obituary text and its editor (mobile). Leave unset to hide the card, as the web does. */
  textEditor?: ObituaryTextEditor;
  /** Step 1 (mobile). Leave unset to hide the card, as the web does. */
  publisherEmail?: PublisherEmail;
  headingRef?: HeadingProps['headingRef'];
  /** For the sheet that "What you'll need" opens to return focus to. */
  checklistRef?: Ref<ButtonNode>;
}

/**
 * "Has the obituary been published?": takes the link (and where it ran), checks it, and moves on to
 * "Who should know?". Mobile's own screen
 * (apps/mobile/src/ui). The link lives in the app; only whether the field has been left or Continue pressed lives here.
 */
export function ShareObituary({ copy, eyebrow, eyebrowTone, link, onLinkChange, linkValid, publisher, onPublisherChange, preview, onBack, onWhatYoullNeed, onContinue, onDraft, onPasteLink, pasteMessage, draftUnavailable, publisherEmail, textEditor, headingRef, checklistRef }: ShareObituaryProps) {
  // A link that was saved earlier and is not good shows its error at once; a link being typed waits until the field is left.
  const [touched, setTouched] = useState(() => link.trim() !== '' && !linkValid);
  const errorId = useId();
  const reasonId = useId();
  const draftReasonId = useId();
  const emailFailedId = useId();
  const copiedId = useId();
  const noteId = useId();
  const addressErrorId = useId();
  const addressHintId = useId();
  const pasteId = useId();
  const savedId = useId();
  const empty = link.trim() === '';
  const showError = touched && !empty && !linkValid;
  const reason = empty ? copy.needLink : undefined;
  const blockedBy = reason ?? (linkValid ? undefined : copy.invalidLink);

  return (
    <View style={styles.screen}>
      <View style={styles.topBar}>
        <Button label={copy.back} variant="header" onPress={onBack} />
        <Button label={copy.checklist} variant="header" opensDialog onPress={onWhatYoullNeed} buttonRef={checklistRef} />
      </View>
      <View style={styles.head}>
        <Eyebrow tone={eyebrowTone}>{eyebrow}</Eyebrow>
        <Heading level={1} headingRef={headingRef}>
          {copy.heading}
        </Heading>
        <Body tone="muted">{copy.intro}</Body>
      </View>
      {textEditor && copy.textTitle ? <TextCard copy={copy} editor={textEditor} savedId={savedId} /> : null}
      {publisherEmail && copy.emailButton && !textEditor?.editing ? (
        <Card>
          {copy.emailTitle ? <Heading level={2}>{copy.emailTitle}</Heading> : null}
          {publisherEmail.hasText ? (
            <>
              {copy.emailBody ? <Body tone="muted">{copy.emailBody}</Body> : null}
              {publisherEmail.address && copy.publisherEmailLabel ? (
                <>
                  <Field
                    label={copy.publisherEmailLabel}
                    optional={copy.optional}
                    accessibleName={`${copy.publisherEmailLabel} ${copy.optional}`}
                    placeholder={copy.publisherEmailPlaceholder ?? ''}
                    value={publisherEmail.address.value}
                    onChangeText={publisherEmail.address.onChange}
                    onBlur={publisherEmail.address.onBlur}
                    invalid={publisherEmail.address.error !== undefined}
                    describedBy={publisherEmail.address.error ? addressErrorId : copy.publisherEmailHint ? addressHintId : undefined}
                    hint={publisherEmail.address.error}
                    email
                    returnKeyType="done"
                  />
                  <Status id={addressErrorId} message={publisherEmail.address.error} tone="danger" />
                  {copy.publisherEmailHint ? (
                    <Body tone="muted" small id={addressHintId}>
                      {copy.publisherEmailHint}
                    </Body>
                  ) : null}
                </>
              ) : null}
              <Button label={copy.emailButton} variant="secondary" busy={publisherEmail.busy} describedBy={publisherEmail.failed ? emailFailedId : undefined} onPress={publisherEmail.onPress} />
              <Status id={emailFailedId} message={publisherEmail.failed ? copy.emailFailed : undefined} tone="danger" />
              <Status id={noteId} message={publisherEmail.failed ? undefined : publisherEmail.note === 'opened' ? copy.emailOpened : publisherEmail.note === 'shared' ? copy.emailShared : undefined} />
              {publisherEmail.onCopyText && copy.copyButton ? (
                <>
                  <Button label={copy.copyButton} variant="secondary" onPress={publisherEmail.onCopyText} />
                  <Status id={copiedId} message={publisherEmail.copyFailed ? copy.copyFailed : publisherEmail.copied ? copy.copied : undefined} />
                </>
              ) : null}
            </>
          ) : copy.emailNoText ? (
            <Body tone="muted">{copy.emailNoText}</Body>
          ) : null}
        </Card>
      ) : null}
      {publisherEmail && copy.linkStepLabel ? <Heading level={2}>{copy.linkStepLabel}</Heading> : null}
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
      {onPasteLink && copy.pasteButton ? (
        <>
          <Button label={copy.pasteButton} variant="secondary" onPress={onPasteLink} />
          <Status id={pasteId} message={pasteMessage} />
        </>
      ) : null}
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
          <Heading level={2}>{copy.draftTitle}</Heading>
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

function TextCard({ copy, editor, savedId }: { copy: ShareObituaryCopy; editor: ObituaryTextEditor; savedId: string }) {
  const hasText = editor.text !== '';
  const editLabelId = useId();
  const font = useSerifStyle('regular');
  const [focused, setFocused] = useState(false);
  return (
    <Card>
      <Heading level={2}>{copy.textTitle}</Heading>
      {editor.editing ? (
        <>
          {copy.editHelp ? <Body tone="muted">{copy.editHelp}</Body> : null}
          <Body tone="strong" id={editLabelId}>
            {copy.editLabel}
          </Body>
          <TextInput
            style={[styles.textInput, font, focused && Platform.OS !== 'web' && styles.inputFocused]}
            {...webFieldHook}
            aria-labelledby={editLabelId}
            accessibilityLabel={copy.editLabel}
            multiline
            autoFocus
            maxLength={editor.maxLength}
            textAlignVertical="top"
            autoCapitalize="sentences"
            placeholder={copy.editPlaceholder}
            placeholderTextColor={colors['neutral-700']}
            value={editor.value}
            onChangeText={editor.onValueChange}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
          />
          <View style={styles.editActions}>
            {copy.saveButton ? <Button label={copy.saveButton} onPress={editor.onSave} /> : null}
            {copy.cancelButton ? <Button label={copy.cancelButton} variant="secondary" onPress={editor.onCancel} /> : null}
          </View>
        </>
      ) : (
        <>
          {hasText ? <Body>{editor.text}</Body> : null}
          {(hasText ? copy.editButton : copy.writeButton) ? (
            <Button label={(hasText ? copy.editButton : copy.writeButton) ?? ''} variant="secondary" buttonRef={editor.editRef} onPress={editor.onEdit} />
          ) : null}
          <Status id={savedId} message={editor.saved ? copy.saved : undefined} />
        </>
      )}
    </Card>
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
  /** An email address: the email keyboard, no auto-capitals. */
  email?: boolean;
  returnKeyType: 'next' | 'done';
}

function Field({ label, optional, accessibleName, placeholder, value, onChangeText, onBlur, invalid, describedBy, hint, url, email, returnKeyType }: FieldProps) {
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
        keyboardType={url && Platform.OS !== 'web' ? 'url' : email ? 'email-address' : 'default'}
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
  topBar: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing[1], justifyContent: 'space-between', alignItems: 'center' },
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
    fontSize: 15,
  },
  textInput: {
    minHeight: 200,
    padding: spacing[2],
    borderWidth: 1,
    borderColor: colors['neutral-600'],
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    color: colors.ink,
    fontSize: 16,
  },
  editActions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing[1], alignItems: 'center' },
  // Last, so an invalid field keeps its error border while it has focus.
  inputInvalid: { borderColor: '#b91c1c', borderWidth: 2 },
  // Native focus cue (web draws its own ring through data-gg-field).
  inputFocused: { borderColor: colors['accent-700'], borderWidth: 2 },
});
