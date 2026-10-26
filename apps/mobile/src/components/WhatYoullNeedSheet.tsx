import { useState } from 'react';
import { StyleSheet, Text } from 'react-native';
import { Sheet } from '@griever/ui';
import { ChecklistRows } from '../screens/WhatYoullNeedScreen';
import { MUTED } from './colors';

/** The "What you'll need" checklist in a sheet. Ticks are the same saved ticks as the full screen. */
export function WhatYoullNeedSheet({ visible, onClose, onDismiss }: { visible: boolean; onClose: () => void; onDismiss?: () => void }) {
  const [tipOpen, setTipOpen] = useState<string | null>(null);
  const close = () => {
    setTipOpen(null);
    onClose();
  };
  return (
    <Sheet
      title="What you'll need"
      closeLabel="Close"
      visible={visible}
      onClose={close}
      // Back closes an open tip first, then the sheet.
      onRequestClose={() => (tipOpen ? setTipOpen(null) : close())}
      onDismiss={onDismiss}
      onBodyTouch={() => setTipOpen(null)}
    >
      <Text style={styles.subtitle}>Not today. Just so none of it surprises you.</Text>
      <ChecklistRows tipOpen={tipOpen} onTipChange={setTipOpen} />
    </Sheet>
  );
}

const styles = StyleSheet.create({
  subtitle: { fontSize: 13, color: MUTED, marginBottom: 16 },
});
