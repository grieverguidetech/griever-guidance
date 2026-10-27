import { StyleSheet, View } from 'react-native';
import { colors } from '@griever/tokens';
import { SerifText } from './SerifText';

export interface SentNoteProps {
  /** The first sentence, set in bold italic. */
  lead: string;
  /** What follows it, set in italic. Split from the lead in the copy, never parsed here. */
  rest?: string;
}

/**
 * The calm note after a send, for example "Everyone has been told. We don't keep a copy...".
 * Plain italic text with no border or card, on web and mobile alike. Contrast: neutral-800 on the
 * page colour passes 4.5:1 (same as Body).
 */
export function SentNote({ lead, rest }: SentNoteProps) {
  return (
    <View>
      <SerifText style={styles.text}>
        <SerifText style={styles.lead}>{lead}</SerifText>
        {rest ? <SerifText style={styles.rest}>{` ${rest}`}</SerifText> : null}
      </SerifText>
    </View>
  );
}

const styles = StyleSheet.create({
  text: { fontSize: 14, lineHeight: 21, fontStyle: 'italic', color: colors['neutral-800'] },
  lead: { fontStyle: 'italic', fontWeight: '600' },
  rest: { fontStyle: 'italic', fontWeight: '400' },
});
