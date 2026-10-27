import { useEffect, useRef } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import type { ButtonNode } from '@griever/ui';
import { Body, Button, focusNode, SerifText as Text } from '@griever/ui';
import { colors } from '@griever/tokens';
import type { Session } from '@griever/hooks';
import { screenCopy } from '@griever/copy';
import { PrimaryButton, ScreenHeader } from '../components/authForm';
import { personLabel } from '../components/PersonSwitcher';
import { isBlank } from '../lib/useDeviceSessions';

const copy = screenCopy('pathLanding');
const IMPORT_LABEL = screenCopy('whoShouldKnow').bringAcross;

export const START_FIRST = "Start with someone I've lost";
export const ADD_PERSON = "Someone else I've lost";

// Someone with a draft but no name yet still shows (as "Someone new"), so their draft is reachable.
const listed = (sessions: Session[]) =>
  sessions.filter((s) => !isBlank(s)).sort((a, b) => b.lastOpenedAt.localeCompare(a.lastOpenedAt));

export type HomeScreenProps = {
  sessions: Session[];
  /** False for a member who may open people but not add them (B10). */
  canCreate: boolean;
  onOpen: (id: string) => void;
  onCreate: () => void;
  /** Only given while accounts are off. With accounts on, "Your account" holds the list. */
  onWhatYoullNeed?: () => void;
  /** Only given when accounts are on. */
  onAccount?: () => void;
  /** Opens the device contacts import. Shown whether accounts are on or off. */
  onImportContacts?: () => void;
  /** Coming back from the import: screen-reader focus goes to its button. */
  focusImport?: boolean;
};

/**
 * Where every launch lands. The people kept on this phone, newest first, and one way to add
 * another. Nothing here removes anyone (C9).
 */
export function HomeScreen({ sessions, canCreate, onOpen, onCreate, onWhatYoullNeed, onAccount, onImportContacts, focusImport }: HomeScreenProps) {
  const importRef = useRef<ButtonNode>(null);
  const people = listed(sessions);
  useEffect(() => {
    if (!focusImport) {
      return;
    }
    focusNode(importRef.current);
  }, [focusImport]);
  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <ScreenHeader>Who you're writing about</ScreenHeader>
      {onWhatYoullNeed ? (
        <View style={styles.headerRow}>
          <Button label={copy.checklist} variant="header" onPress={onWhatYoullNeed} />
        </View>
      ) : null}
      {people.length > 0 ? (
        <View style={styles.intro}>
          <Body tone="muted">Each person is kept separately on this phone.</Body>
        </View>
      ) : null}
      {people.length === 0 ? (
        <View style={styles.intro}>
          <Body tone="muted">
            {canCreate ? 'No one here yet.' : 'When someone adds you to help, the people you\'re helping will show here.'}
          </Body>
        </View>
      ) : null}
      {people.map((s) => (
        <Pressable
          key={s.id}
          style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
          onPress={() => onOpen(s.id)}
          accessibilityRole="button"
          accessibilityLabel={`${personLabel(s)}${s.dateOfPassing ? `, passed ${s.dateOfPassing}` : ''}`}
        >
          <Text style={styles.rowName}>{personLabel(s)}</Text>
          {s.dateOfPassing ? <Body tone="muted" small>{s.dateOfPassing}</Body> : null}
        </Pressable>
      ))}
      {canCreate ? (
        <View style={styles.create}>
          <PrimaryButton label={people.length > 0 ? ADD_PERSON : START_FIRST} pending={false} onPress={onCreate} />
        </View>
      ) : null}
      {onAccount ? (
        // Outline, page showing through: the shared `header` variant (web's top bar look).
        <View style={styles.account} testID="home-account-row">
          <Button label="Your account" variant="header" onPress={onAccount} />
        </View>
      ) : null}
      {onImportContacts ? (
        <View style={onAccount ? styles.importBelow : styles.account} testID="home-import-row">
          <Button label={IMPORT_LABEL} variant="header" onPress={onImportContacts} buttonRef={importRef} />
        </View>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 24, paddingTop: 60 },
  headerRow: { alignSelf: 'flex-start', marginBottom: 8 },
  intro: { marginBottom: 16 },
  row: {
    minHeight: 44,
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: colors['neutral-600'],
    borderRadius: 10,
    backgroundColor: colors.surface,
    marginBottom: 12,
  },
  rowPressed: { backgroundColor: colors['accent-100'] },
  rowName: { fontSize: 17, color: colors.ink, fontWeight: '600' },
  create: { marginTop: 8 },
  account: { width: '100%', marginTop: 32 },
  importBelow: { width: '100%', marginTop: 12 },
});
