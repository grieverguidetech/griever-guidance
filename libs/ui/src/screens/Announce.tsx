import { useId } from 'react';
import type { ReactNode, Ref } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { colors, radius, spacing } from '@griever/tokens';
import { Button } from '../Button';
import type { ButtonNode } from '../Button';
import { Card } from '../Card';
import { Heading } from '../Heading';
import { Body, Eyebrow } from '../Text';
import { useSerifStyle } from '../typography';
import type { HeadingProps } from '../Heading';

/** The words the screen needs. libs/copy/screens/announce.json has these keys, plus more. */
export interface AnnounceCopy {
  heading: string;
  intro: string;
  back: string;
  checklist: string;
  kicker: string;
  edit: string;
  noteLabel: string;
  optional: string;
  placeholder: string;
  continue: string;
}

export interface AnnounceProps {
  copy: AnnounceCopy;
  /** The eyebrow line, for example "For Margaret". */
  eyebrow: string;
  eyebrowTone?: 'accent' | 'accent2';
  /** The "From your details" line, already built (see announceRecap in libs/copy). */
  recap: string;
  /** The optional note (flow field personalNote). */
  note: string;
  onNoteChange: (note: string) => void;
  onBack: () => void;
  onWhatYoullNeed: () => void;
  onEdit: () => void;
  onContinue: () => void;
  /** After the Continue button, for example the saved note. */
  footer?: ReactNode;
  headingRef?: HeadingProps['headingRef'];
  /** For the sheet that "What you'll need" opens to return focus to. */
  checklistRef?: Ref<ButtonNode>;
}

/**
 * "Announce the passing": confirms the person's details and takes an optional note. Built from
 * libs/ui so web (through react-native-web) and mobile show the same screen. It owns no state.
 */
export function Announce({ copy, eyebrow, eyebrowTone, recap, onBack, onWhatYoullNeed, onEdit, onContinue, note, onNoteChange, footer, headingRef, checklistRef }: AnnounceProps) {
  const inputFont = useSerifStyle('regular');
  const noteLabel = `${copy.noteLabel} ${copy.optional}`;
  const labelId = useId();
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
      <Card>
        <Body tone="muted" small>
          {copy.kicker}
        </Body>
        <Body>{recap}</Body>
        <View style={styles.start}>
          <Button label={copy.edit} variant="ghost" onPress={onEdit} />
        </View>
      </Card>
      <View style={styles.field}>
        <Body tone="strong" id={labelId}>
          {copy.noteLabel} <Text style={styles.optional}>{copy.optional}</Text>
        </Body>
        <TextInput
          style={[styles.input, inputFont]}
          // Web names the field from the visible label; native reads the label text directly.
          aria-labelledby={labelId}
          {...webFieldHook}
          accessibilityLabel={noteLabel}
          multiline
          numberOfLines={3}
          placeholder={copy.placeholder}
          placeholderTextColor={colors['neutral-700']}
          value={note}
          onChangeText={onNoteChange}
        />
      </View>
      <Button label={copy.continue} onPress={onContinue} />
      {footer}
    </View>
  );
}

/** Web: lets apps/web/src/styles.css draw its field focus ring (data-gg-field). Ignored on native. */
const webFieldHook: Record<string, unknown> = { dataSet: { ggField: 'true' } };

const styles = StyleSheet.create({
  screen: { gap: spacing[3] },
  topBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  start: { alignSelf: 'flex-start' },
  optional: { color: colors['neutral-700'], fontWeight: '400' },
  field: { gap: spacing[1] },
  input: {
    minHeight: 88,
    padding: spacing[2],
    borderWidth: 1,
    borderColor: colors['neutral-600'],
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    color: colors.ink,
    fontSize: 14,
    textAlignVertical: 'top',
  },
  head: { gap: spacing[1] },
});
