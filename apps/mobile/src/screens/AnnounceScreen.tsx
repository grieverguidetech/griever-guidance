import { useEffect, useRef } from 'react';
import type { ComponentRef } from 'react';
import { AccessibilityInfo, findNodeHandle, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { announceRecap, fill, screenCopy } from '@griever/copy';
import { Announce } from '@griever/ui';
import { colors, spacing } from '@griever/tokens';
import type { FlowProps, RootStackParamList } from '../app/App';
import { SavedNote } from '../components/SavedNote';

const copy = screenCopy('announce');

type Props = FlowProps & { onEditPerson: () => void };

/** The screen is the shared Announce in libs/ui; this holds what is mobile only: routing and focus. */
export function AnnounceScreen({ flow, onEditPerson }: Props) {
  const { fields, setField, nextStep, prevStep, session } = flow;
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const heading = useRef<ComponentRef<typeof Text>>(null);

  // The heading takes screen-reader focus when the screen opens.
  useEffect(() => {
    const handle = heading.current ? findNodeHandle(heading.current) : null;
    if (handle) {
      AccessibilityInfo.setAccessibilityFocus(handle);
    }
  }, []);

  const name = session?.personName?.trim() || copy.nameFallback;
  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView style={styles.flex} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Announce
          copy={copy}
          eyebrow={fill(copy.forName, { name })}
          recap={announceRecap(session, copy)}
          note={fields['personalNote'] ?? ''}
          onNoteChange={(note) => setField('personalNote', note)}
          onBack={prevStep}
          onWhatYoullNeed={() => navigation.navigate('WhatYoullNeed')}
          onEdit={onEditPerson}
          onContinue={nextStep}
          headingRef={heading}
          footer={<SavedNote />}
        />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing[3], paddingTop: spacing[4] },
});
