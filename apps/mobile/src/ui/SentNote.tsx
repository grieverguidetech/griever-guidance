import { StyleSheet, View } from 'react-native';
import { v2 } from '@griever/tokens';
import { SerifText } from './SerifText';

export interface SentNoteProps {
  /** The first sentence, set in Sora 500. */
  lead: string;
  /** What follows it, set in Sora 400. Split from the lead in the copy, never parsed here. */
  rest?: string;
}

/**
 * The calm note after a send, for example "Everyone has been told. We don't keep a copy...".
 * Plain text with no border or card. Contrast: neutral-800 on the
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
  text: { fontSize: 14, lineHeight: 21, color: v2.roles.mutedStrong },
  lead: { fontWeight: '600' },
  rest: { fontWeight: '400' },
});
