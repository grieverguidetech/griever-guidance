import { StyleSheet, Text } from 'react-native';
import { MUTED } from './colors';

/** The one reassurance line (DS-3). Same words as web's SavedNote in apps/web/src/lib/ui.tsx. */
export const SAVED_NOTE_TEXT = 'Everything is saved on this phone as you go. You can stop and come back.';

/** Plain text under a flow step's content: not a live region, so a screen reader reads it in order. */
export function SavedNote() {
  return <Text style={styles.note}>{SAVED_NOTE_TEXT}</Text>;
}

const styles = StyleSheet.create({
  note: { fontSize: 12, color: MUTED, textAlign: 'center', marginTop: 16, marginBottom: 8 },
});
