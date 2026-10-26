import { useEffect, useId, useRef, useState } from 'react';
import type { ComponentRef, ReactNode, Ref } from 'react';
import { AccessibilityInfo, Platform, StyleSheet, Text, TextInput, View } from 'react-native';
import { colors, radius, spacing } from '@griever/tokens';
import { Button } from '../Button';
import type { ButtonNode } from '../Button';
import { Card } from '../Card';
import { focusNode } from '../focusNode';
import { Heading } from '../Heading';
import type { HeadingProps } from '../Heading';
import { Body } from '../Text';
import { useSerifStyle } from '../typography';

type TextInputNode = ComponentRef<typeof TextInput>;

/** The words the screen needs. libs/copy/screens/review.json has these keys, plus more. */
export interface ReviewCopy {
  heading: string;
  headingAnnouncement: string;
  back: string;
  announcementTag: string;
  messageLabel: string;
  edit: string;
  doneEditing: string;
  softer: string;
  /** Why the tone button is unavailable once the words are edited. */
  toneKept: string;
  useSuggested: string;
  checklist: string;
  /** Why Send is unavailable when the message is empty. */
  blank: string;
  /** Why Send is unavailable when no one is chosen. Both apps only reach this screen with someone chosen, so it guards a state that should not happen. */
  noRecipients: string;
  privacy: string;
}

export interface ReviewProps {
  copy: ReviewCopy;
  /** `announcement` has the tag, Edit wording and the tone switch. `service` always shows the field. */
  kind: 'announcement' | 'service' | 'other';
  /** The line under the heading, already built (for example "This will go to 2 people."). */
  intro: string;
  message: string;
  onMessageChange: (message: string) => void;
  /** The person's own words are in use (the app holds an override). */
  edited: boolean;
  /** Drops the edit and returns to the suggested wording. */
  onUseSuggested: () => void;
  /** `softer` or `plain`. */
  tone: string;
  onToneChange: (tone: 'softer' | 'plain') => void;
  /** The send button's name, already built (see sendLabel in libs/copy). */
  sendLabel: string;
  hasRecipients: boolean;
  onBack: () => void;
  onSend: () => void;
  /** Opens "What you'll need". Leave unset to hide the button. */
  onWhatYoullNeed?: () => void;
  /** For the sheet that "What you'll need" opens to return focus to. */
  checklistRef?: Ref<ButtonNode>;
  /** Between the message and the buttons, for example the sample and the flowers choice. */
  children?: ReactNode;
  headingRef?: HeadingProps['headingRef'];
}

/**
 * "Review your message": read the text once, change the wording or tone, then send. Built from
 * libs/ui so web (through react-native-web) and mobile show the same screen. The message and tone
 * live in the app; only whether the field is open lives here.
 */
export function Review({ copy, kind, intro, message, onMessageChange, edited, onUseSuggested, tone, onToneChange, sendLabel, hasRecipients, onBack, onSend, onWhatYoullNeed, checklistRef, children, headingRef }: ReviewProps) {
  const announcement = kind === 'announcement';
  const [editing, setEditing] = useState(false);
  const [returnFocus, setReturnFocus] = useState(false);
  const fieldRef = useRef<TextInputNode>(null);
  const editRef = useRef<ButtonNode>(null);
  const reasonId = useId();
  const toneReasonId = useId();
  const blank = message.trim() === '';
  const reason = blank ? copy.blank : hasRecipients ? undefined : copy.noRecipients;

  // Focus follows the field: into it when Edit wording opens, back to the toggle when it closes.
  useEffect(() => {
    if (editing) {
      fieldRef.current?.focus();
    } else if (returnFocus) {
      focusNode(editRef.current);
      setReturnFocus(false);
    }
  }, [editing, returnFocus]);

  const toggleEditing = () => {
    if (editing) {
      setReturnFocus(true);
    }
    setEditing(!editing);
  };

  return (
    <View style={styles.screen}>
      <View style={styles.topBar}>
        <Button label={copy.back} variant="tertiary" onPress={onBack} />
        {onWhatYoullNeed ? (
          <Button label={copy.checklist} variant="tertiary" outlined opensDialog onPress={onWhatYoullNeed} buttonRef={checklistRef} />
        ) : null}
      </View>
      <View style={styles.head}>
        <Heading level={1} headingRef={headingRef}>
          {announcement ? copy.headingAnnouncement : copy.heading}
        </Heading>
        <Body tone="muted">{intro}</Body>
      </View>
      <Card>
        {announcement ? (
          <View style={styles.tag}>
            <Text style={styles.tagText}>{copy.announcementTag}</Text>
          </View>
        ) : null}
        {editing || kind === 'service' ? (
          <MessageField label={copy.messageLabel} value={message} onChangeText={onMessageChange} inputRef={fieldRef} />
        ) : (
          <Body>{message}</Body>
        )}
      </Card>
      {children}
      {announcement ? (
        <View style={styles.actions}>
          <Button label={editing ? copy.doneEditing : copy.edit} variant="secondary" buttonRef={editRef} onPress={toggleEditing} />
          <Button
            label={copy.softer}
            variant="ghost"
            pressed={tone === 'softer'}
            ariaDisabled={edited}
            announceDisabled
            describedBy={edited ? toneReasonId : undefined}
            hint={edited ? copy.toneKept : undefined}
            onPress={() => {
              if (!edited) {
                onToneChange(tone === 'softer' ? 'plain' : 'softer');
              }
            }}
          />
          <Status id={toneReasonId} message={edited ? copy.toneKept : undefined} />
        </View>
      ) : null}
      {edited ? <Button label={copy.useSuggested} variant="ghost" onPress={onUseSuggested} /> : null}
      <Button
        label={sendLabel}
        ariaDisabled={reason !== undefined}
        announceDisabled
        describedBy={reason ? reasonId : undefined}
        hint={reason}
        onPress={() => {
          if (!reason) {
            onSend();
          }
        }}
      />
      <Status id={reasonId} message={reason} />
      <Body tone="muted" small>
        {copy.privacy}
      </Body>
    </View>
  );
}

/** Web: lets apps/web/src/styles.css draw its field focus ring (data-gg-field). Ignored on native. */
const webFieldHook: Record<string, unknown> = { dataSet: { ggField: 'true' } };

interface MessageFieldProps {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  inputRef: Ref<TextInputNode>;
}

function MessageField({ label, value, onChangeText, inputRef }: MessageFieldProps) {
  const font = useSerifStyle('regular');
  const labelId = useId();
  const [focused, setFocused] = useState(false);
  return (
    <View style={styles.field}>
      <Body tone="strong" id={labelId}>
        {label}
      </Body>
      <TextInput
        ref={inputRef}
        style={[styles.input, font, focused && Platform.OS !== 'web' && styles.inputFocused]}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        {...webFieldHook}
        // Web names the field from the visible label; native reads the label text directly.
        aria-labelledby={labelId}
        accessibilityLabel={label}
        multiline
        numberOfLines={6}
        value={value}
        onChangeText={onChangeText}
      />
    </View>
  );
}

/**
 * A reason a button is unavailable. The polite status node is always rendered and only its text
 * changes, so screen readers announce the change. Also announced on iOS (it ignores live regions).
 */
function Status({ id, message }: { id: string; message?: string }) {
  useEffect(() => {
    if (message && Platform.OS === 'ios') {
      AccessibilityInfo.announceForAccessibility(message);
    }
  }, [message]);
  return (
    <Body id={id} tone="muted" live>
      {message ?? ''}
    </Body>
  );
}

const styles = StyleSheet.create({
  screen: { gap: spacing[3] },
  topBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  head: { gap: spacing[1] },
  tag: { alignSelf: 'flex-start', backgroundColor: colors['accent-2-100'], borderRadius: radius.md, paddingHorizontal: spacing[2], paddingVertical: 2 },
  tagText: { color: colors['accent-2-800'], fontSize: 12 },
  actions: { gap: spacing[1] },
  field: { gap: spacing[1] },
  input: {
    minHeight: 132,
    padding: spacing[2],
    borderWidth: 1,
    borderColor: colors['neutral-600'],
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    color: colors.ink,
    fontSize: 14,
    textAlignVertical: 'top',
  },
  // Native focus cue (web draws its own ring through data-gg-field).
  inputFocused: { borderColor: colors['accent-700'], borderWidth: 2 },
});
