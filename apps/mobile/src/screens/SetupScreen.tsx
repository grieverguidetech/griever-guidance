import { useEffect, useRef, useState } from 'react';
import type { ComponentRef } from 'react';
import { AccessibilityInfo, BackHandler, findNodeHandle, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text } from 'react-native';
import { screenCopy } from '@griever/copy';
import { PersonSetup } from '@griever/ui';
import type { ButtonNode } from '@griever/ui';
import { colors, spacing } from '@griever/tokens';
import { PassingDateField } from '../components/PassingDateField';
import { SavedNote } from '../components/SavedNote';
import { WhatYoullNeedSheet } from '../components/WhatYoullNeedSheet';

const copy = screenCopy('personSetup');

export type SetupDetails = { personName: string; dateOfPassing: string };

type Props = {
  /** What is already kept for this person (empty for someone new). */
  initial: SetupDetails;
  onContinue: (details: SetupDetails) => void;
  onBack: () => void;
};

/**
 * Asked once, before the first message, so the name and date are not typed again in every moment.
 * The screen is the shared PersonSetup in libs/ui; this holds what is mobile only: the native date
 * picker, focus, Android Back and the sheet. Only the name is required. There is deliberately no
 * obituary field here (C10).
 */
export function SetupScreen({ initial, onContinue, onBack }: Props) {
  const [name, setName] = useState(initial.personName);
  const [date, setDate] = useState(initial.dateOfPassing);
  const [sheetOpen, setSheetOpen] = useState(false);
  const heading = useRef<ComponentRef<typeof Text>>(null);
  const needButton = useRef<ButtonNode>(null);

  // The heading takes screen-reader focus when the screen opens.
  useEffect(() => {
    const handle = heading.current ? findNodeHandle(heading.current) : null;
    if (handle) {
      AccessibilityInfo.setAccessibilityFocus(handle);
    }
  }, []);

  // iOS tells us when the sheet is gone; Android returns to the last focused view by itself.
  const focusNeedButton = () => {
    const handle = needButton.current ? findNodeHandle(needButton.current) : null;
    if (handle) {
      AccessibilityInfo.setAccessibilityFocus(handle);
    }
  };

  // Android's back button means Home here, not leaving the app.
  useEffect(() => {
    if (sheetOpen) {
      return; // the sheet's own Back handler closes it
    }
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      onBack();
      return true;
    });
    return () => sub.remove();
  }, [onBack, sheetOpen]);

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView style={styles.flex} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <PersonSetup
          copy={copy}
          backName={copy.backName}
          name={name}
          onNameChange={setName}
          renderDate={({ accessibleName }) => <PassingDateField copy={copy} value={date} onChange={setDate} accessibleName={accessibleName} />}
          onBack={onBack}
          onWhatYoullNeed={() => setSheetOpen(true)}
          onContinue={() => onContinue({ personName: name.trim(), dateOfPassing: date.trim() })}
          headingRef={heading}
          checklistRef={needButton}
          footer={<SavedNote />}
        />
      </ScrollView>
      <WhatYoullNeedSheet visible={sheetOpen} onClose={() => setSheetOpen(false)} onDismiss={focusNeedButton} />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing[3], paddingTop: 64 },
});
