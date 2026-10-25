// PROTOTYPE #322: the shared hub on mobile, with sample rows. Throwaway.
import { ScrollView, StyleSheet } from 'react-native';
import { prototypePathLandingCopy } from '@griever/copy';
import { PrototypeHub } from '@griever/ui';
import type { PrototypeHubRow } from '@griever/ui';

const ROWS: PrototypeHubRow[] = [
  { key: 'announce', status: 'done', started: false, locked: false, meta: '2 people · May 30 · Send again' },
  { key: 'service', status: 'next', started: false, locked: false },
  { key: 'obituary', status: 'later', started: true, locked: false },
  { key: 'thanks', status: 'later', started: false, locked: true },
];

export function PrototypeHubScreen() {
  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <PrototypeHub
        copy={prototypePathLandingCopy}
        personName="Margaret Hale"
        rows={ROWS}
        lockedReason="Included with the full plan"
        onBack={() => undefined}
        onChecklist={() => undefined}
        onEditPerson={() => undefined}
        onStartMoment={() => undefined}
        onLockedPress={() => undefined}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#f3f2f2' },
  content: { padding: 24 },
});
