import { useEffect, useRef, useState } from 'react';
import type { ComponentRef } from 'react';
import { AccessibilityInfo, BackHandler, findNodeHandle, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text } from 'react-native';
import { screenCopy } from '@griever/copy';
import type { ChecklistFields, ChecklistItemId, ChecklistItemState } from '@griever/shared';
import { PersonSetup } from '../ui';
import type { ButtonNode } from '../ui';
import { colors, spacing } from '@griever/tokens';
import { PassingDateField } from '../components/PassingDateField';
import { SavedNote } from '../components/SavedNote';
import { PersonChecklistSheet } from '../components/PersonChecklistSheet';

const copy = screenCopy('personSetup');

export type SetupDetails = { personName: string; dateOfPassing: string };

type Props = {
  /** What is already kept for this person (empty for someone new). */
  initial: SetupDetails;
  /** The open person's phase ticks, and how to save one. The person exists before setup, so the same sheet as the person screen opens. */
  checklist: ChecklistFields['checklist'];
  onSetItem: (id: ChecklistItemId, state: ChecklistItemState | null) => void;
  onContinue: (details: SetupDetails) => void;
  onBack: () => void;
  /** Opened with Edit from the hub or a step: Back returns there, so it keeps its short name. */
  returnsToPlace?: boolean;
};

/**
 * Asked once, before the first message, so the name and date are not typed again in every moment.
 * The screen is the PersonSetup in apps/mobile/src/ui; this holds what is mobile only: the native date
 * picker, focus, Android Back and the sheet. Only the name is required. There is deliberately no
 * obituary field here (C10).
 */
export function SetupScreen({ initial, checklist, onSetItem, onContinue, onBack, returnsToPlace = false }: Props) {
  const [name, setName] = useState(initial.personName);
  const [date, setDate] = useState(initial.dateOfPassing);
  const [sheetOpen, setSheetOpen] = useState(false);
  const heading = useRef<ComponentRef<typeof Text>>(null);
  const needButton = useRef<ButtonNode>(null);
  // The Android focus return waits one tick; an unmount before it runs cancels it.
  const focusTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(focusTimer.current), []);

  // The heading takes screen-reader focus when the screen opens.
  useEffect(() => {
    const handle = heading.current ? findNodeHandle(heading.current) : null;
    if (handle) {
      AccessibilityInfo.setAccessibilityFocus(handle);
    }
  }, []);

  // iOS tells us when the sheet is gone (onDismiss); Android does not, so focus goes back when it is closed.
  const focusNeedButton = () => {
    const handle = needButton.current ? findNodeHandle(needButton.current) : null;
    if (handle) {
      AccessibilityInfo.setAccessibilityFocus(handle);
    }
  };

  const closeSheet = () => {
    setSheetOpen(false);
    if (Platform.OS !== 'ios') {
      focusTimer.current = setTimeout(focusNeedButton, 0);
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
          editing={returnsToPlace}
          backName={returnsToPlace ? undefined : copy.backName}
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
      <PersonChecklistSheet visible={sheetOpen} onClose={closeSheet} onDismiss={focusNeedButton} checklist={checklist} onSetItem={onSetItem} />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing[3], paddingTop: spacing[4] },
});
