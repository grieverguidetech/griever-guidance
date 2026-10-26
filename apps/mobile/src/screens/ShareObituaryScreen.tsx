import { useEffect, useRef, useState } from 'react';
import type { ComponentRef } from 'react';
import { AccessibilityInfo, BackHandler, findNodeHandle, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text } from 'react-native';
import { fill, screenCopy } from '@griever/copy';
import { isValidObituaryLink, obituaryLink } from '@griever/shared';
import type { Session } from '@griever/hooks';
import { ShareObituary } from '@griever/ui';
import type { ButtonNode } from '@griever/ui';
import { colors, spacing } from '@griever/tokens';
import { WhatYoullNeedSheet } from '../components/WhatYoullNeedSheet';

const copy = screenCopy('shareObituary');

type Props = {
  session: Session;
  onChange: (patch: { obituaryUrl?: string; obituaryPublisher?: string }) => void;
  onBack: () => void;
  onContinue: () => void;
};

/**
 * The screen is the shared ShareObituary in libs/ui; this holds what is mobile only: focus, Android
 * Back and the sheet. It passes no drafting handler, so the drafting card is not shown.
 */
export function ShareObituaryScreen({ session, onChange, onBack, onContinue }: Props) {
  const heading = useRef<ComponentRef<typeof Text>>(null);
  const checklistButton = useRef<ButtonNode>(null);
  const [checklistOpen, setChecklistOpen] = useState(false);
  const sheetOpen = useRef(false);
  sheetOpen.current = checklistOpen;

  // The heading takes screen-reader focus when the screen opens.
  useEffect(() => {
    const handle = heading.current ? findNodeHandle(heading.current) : null;
    if (handle) {
      AccessibilityInfo.setAccessibilityFocus(handle);
    }
  }, []);

  // Android Back goes to the hub, as the Back button does. A sheet that is open takes Back first.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (sheetOpen.current) {
        return false;
      }
      onBack();
      return true;
    });
    return () => sub.remove();
  }, [onBack]);

  // iOS tells us when the sheet is gone; Android returns to the last focused view by itself.
  const focusChecklistButton = () => {
    const handle = checklistButton.current ? findNodeHandle(checklistButton.current) : null;
    if (handle) {
      AccessibilityInfo.setAccessibilityFocus(handle);
    }
  };

  const linkValid = isValidObituaryLink(session.obituaryUrl);
  const name = session.personName.trim() || copy.nameFallback;
  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView style={styles.flex} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <ShareObituary
          copy={copy}
          eyebrow={fill(copy.forName, { name })}
          eyebrowTone="accent2"
          link={session.obituaryUrl}
          onLinkChange={(obituaryUrl) => onChange({ obituaryUrl })}
          linkValid={linkValid}
          publisher={session.obituaryPublisher ?? ''}
          onPublisherChange={(obituaryPublisher) => onChange({ obituaryPublisher })}
          // The card is the message itself, so what is read here is what is sent.
          preview={linkValid ? obituaryLink.renderMessage({ deceasedName: name, obituaryUrl: session.obituaryUrl }) : undefined}
          onBack={onBack}
          onWhatYoullNeed={() => setChecklistOpen(true)}
          onContinue={onContinue}
          headingRef={heading}
          checklistRef={checklistButton}
        />
      </ScrollView>
      <WhatYoullNeedSheet visible={checklistOpen} onClose={() => setChecklistOpen(false)} onDismiss={focusChecklistButton} />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing[3], paddingTop: 64 },
});
