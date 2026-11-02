import { useEffect, useId, useRef, useState } from 'react';
import type { ComponentRef, ReactNode, Ref } from 'react';
import { Platform, StyleSheet, TextInput, View } from 'react-native';
import { colors, radius, spacing } from '@griever/tokens';
import { Button } from '../Button';
import { SerifText } from '../SerifText';
import type { ButtonNode } from '../Button';
import { Card } from '../Card';
import { focusNode } from '../focusNode';
import { Heading } from '../Heading';
import type { HeadingProps } from '../Heading';
import { Body } from '../Text';
import { Status } from '../Status';
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
  /** Restores the words that "Use the suggested wording" just dropped. */
  bringBack: string;
  checklist: string;
  /** Why Send is unavailable when the message is empty. */
  blank: string;
  /** Why Share elsewhere is unavailable when the message is empty. */
  shareBlank: string;
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
  /** Why Send is unavailable for a reason the app knows (for example a required detail is empty). Blank and no-recipients come first. */
  blockedReason?: string;
  onBack: () => void;
  onSend: () => void;
  /** Opens "What you'll need". Leave unset to hide the button. */
  onWhatYoullNeed?: () => void;
  /** For the sheet that "What you'll need" opens to return focus to. */
  checklistRef?: Ref<ButtonNode>;
  /** Between the message and the buttons, for example the sample and the flowers choice. */
  children?: ReactNode;
  headingRef?: HeadingProps['headingRef'];
  /**
   * Mobile: "Share elsewhere" for the service and obituary. Leave unset on web and for the announcement
   * and thank-you, and the button is not drawn.
   */
  share?: {
    label: string;
    onPress: () => void;
    /** For returning focus to the button once the share sheet has closed. */
    buttonRef?: Ref<ButtonNode>;
    /** A calm line when the share sheet did not open. */
    error?: string;
    /** No one is picked, so Share elsewhere is the only action: Send and the texting note are not drawn. */
    only?: boolean;
  };
}

/**
 * "Review your message": read the text once, change the wording or tone, then send. Mobile's own
 * screen (apps/mobile/src/ui). The message and tone
 * live in the app; only whether the field is open lives here.
 */
export function Review({ copy, kind, intro, message, onMessageChange, edited, onUseSuggested, tone, onToneChange, sendLabel, hasRecipients, blockedReason, onBack, onSend, onWhatYoullNeed, checklistRef, children, headingRef, share }: ReviewProps) {
  const announcement = kind === 'announcement';
  const [editing, setEditing] = useState(false);
  const [returnFocus, setReturnFocus] = useState(false);
  const fieldRef = useRef<TextInputNode>(null);
  const editRef = useRef<ButtonNode>(null);
  const reasonId = useId();
  const toneReasonId = useId();
  // The words dropped by "Use the suggested wording", kept until the next edit.
  const [dropped, setDropped] = useState<string | null>(null);
  const blank = message.trim() === '';
  const shareReasonId = useId();
  const shareErrorId = useId();
  const shareReason = blank ? copy.shareBlank : blockedReason;
  const reason = blank ? copy.blank : !hasRecipients ? copy.noRecipients : blockedReason;

  // Focus follows the field: into it when Edit wording opens, back to the toggle when it closes.
  useEffect(() => {
    if (editing) {
      fieldRef.current?.focus();
    } else if (returnFocus) {
      focusNode(editRef.current);
      setReturnFocus(false);
    }
  }, [editing, returnFocus]);

  const changeMessage = (next: string) => {
    setDropped(null);
    onMessageChange(next);
  };

  const useSuggestedWording = () => {
    setDropped(message);
    onUseSuggested();
  };

  const bringBackWords = () => {
    if (dropped !== null) {
      onMessageChange(dropped);
      setDropped(null);
    }
  };

  const toggleEditing = () => {
    if (editing) {
      setReturnFocus(true);
    }
    setEditing(!editing);
  };

  return (
    <View style={styles.screen}>
      <View style={styles.topBar}>
        <Button label={copy.back} variant="header" onPress={onBack} />
        {onWhatYoullNeed ? (
          <Button label={copy.checklist} variant="header" opensDialog onPress={onWhatYoullNeed} buttonRef={checklistRef} />
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
            <SerifText style={styles.tagText}>{copy.announcementTag}</SerifText>
          </View>
        ) : null}
        {editing || kind === 'service' ? (
          <MessageField label={copy.messageLabel} value={message} onChangeText={changeMessage} inputRef={fieldRef} />
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
      {edited ? <Button label={copy.useSuggested} variant="ghost" onPress={useSuggestedWording} /> : null}
      {!edited && dropped !== null ? <Button label={copy.bringBack} variant="ghost" onPress={bringBackWords} /> : null}
      {share?.only ? null : (
        <>
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
        </>
      )}
      {share ? (
        <>
          <Button
            label={share.label}
            variant={share.only ? 'primary' : 'secondary'}
            buttonRef={share.buttonRef}
            ariaDisabled={shareReason !== undefined}
            announceDisabled
            describedBy={shareReason ? shareReasonId : undefined}
            hint={shareReason}
            onPress={() => {
              if (!shareReason) {
                share.onPress();
              }
            }}
          />
          <Status id={shareReasonId} message={shareReason} />
          <Status id={shareErrorId} message={share.error} tone="danger" />
        </>
      ) : null}
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

const styles = StyleSheet.create({
  screen: { gap: spacing[3] },
  topBar: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing[1], justifyContent: 'space-between', alignItems: 'center' },
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
    fontSize: 15,
    textAlignVertical: 'top',
  },
  // Native focus cue (web draws its own ring through data-gg-field).
  inputFocused: { borderColor: colors['accent-700'], borderWidth: 2 },
});
