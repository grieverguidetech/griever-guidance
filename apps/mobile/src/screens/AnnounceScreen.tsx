import { useEffect, useRef, useState } from 'react';
import type { ComponentRef } from 'react';
import { AccessibilityInfo, findNodeHandle, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text } from 'react-native';
import { announceRecap, fill, screenCopy } from '@griever/copy';
import { Announce } from '@griever/ui';
import type { ButtonNode } from '@griever/ui';
import { colors, spacing } from '@griever/tokens';
import type { FlowProps } from '../app/App';
import { WhatYoullNeedSheet } from '../components/WhatYoullNeedSheet';
import { SavedNote } from '../components/SavedNote';

const copy = screenCopy('announce');

type Props = FlowProps & { onEditPerson: () => void };

/** The screen is the shared Announce in libs/ui; this holds what is mobile only: routing and focus. */
export function AnnounceScreen({ flow, onEditPerson }: Props) {
  const { fields, setField, nextStep, prevStep, session } = flow;
  const heading = useRef<ComponentRef<typeof Text>>(null);
  const checklistButton = useRef<ButtonNode>(null);
  const [checklistOpen, setChecklistOpen] = useState(false);

  // The heading takes screen-reader focus when the screen opens.
  useEffect(() => {
    const handle = heading.current ? findNodeHandle(heading.current) : null;
    if (handle) {
      AccessibilityInfo.setAccessibilityFocus(handle);
    }
  }, []);

  // iOS tells us when the sheet is gone; Android returns to the last focused view by itself.
  const focusChecklistButton = () => {
    const handle = checklistButton.current ? findNodeHandle(checklistButton.current) : null;
    if (handle) {
      AccessibilityInfo.setAccessibilityFocus(handle);
    }
  };

  const name = session?.personName?.trim() || copy.nameFallback;
  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView style={styles.flex} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Announce
          copy={copy}
          eyebrow={fill(copy.forName, { name })}
          eyebrowTone="accent2"
          recap={announceRecap(session, copy)}
          note={fields['personalNote'] ?? ''}
          onNoteChange={(note) => setField('personalNote', note)}
          onBack={prevStep}
          onWhatYoullNeed={() => setChecklistOpen(true)}
          onEdit={onEditPerson}
          onContinue={nextStep}
          headingRef={heading}
          checklistRef={checklistButton}
          footer={<SavedNote />}
        />
      </ScrollView>
      <WhatYoullNeedSheet visible={checklistOpen} onClose={() => setChecklistOpen(false)} onDismiss={focusChecklistButton} />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing[3], paddingTop: spacing[4] },
});
