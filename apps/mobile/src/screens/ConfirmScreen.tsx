import { useRef, useState } from 'react';
import { AccessibilityInfo, findNodeHandle, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TouchableOpacity } from 'react-native';
import { fill, recipientsPhrase, screenCopy, sendLabel } from '@griever/copy';
import { SHARE_SERVICE_SAMPLE } from '@griever/shared';
import { Review } from '@griever/ui';
import type { ButtonNode } from '@griever/ui';
import { colors, spacing } from '@griever/tokens';
import type { FlowProps } from '../app/App';
import { WhatYoullNeedSheet } from '../components/WhatYoullNeedSheet';
import { ACCENT, MUTED } from '../components/colors';

const copy = screenCopy('review');

/** The screen is the shared Review in libs/ui; this holds what is mobile only: scrolling and the sample. */
export function ConfirmScreen({ flow }: FlowProps) {
  const { selectedTemplate, composedMessage, selectedContactIds, prevStep, startSendJob, setMessageOverride } = flow;
  const [sampleOpen, setSampleOpen] = useState(false);
  const [checklistOpen, setChecklistOpen] = useState(false);
  const checklistButton = useRef<ButtonNode>(null);

  if (!selectedTemplate) {
    return null;
  }

  // iOS tells us when the sheet is gone; Android returns to the last focused view by itself.
  const focusChecklistButton = () => {
    const handle = checklistButton.current ? findNodeHandle(checklistButton.current) : null;
    if (handle) {
      AccessibilityInfo.setAccessibilityFocus(handle);
    }
  };

  const isAnnouncement = flow.templateCategory === 'announcement';
  const isService = flow.templateCategory === 'service';
  const recipientCount = selectedContactIds.length;
  const recipients = recipientsPhrase(recipientCount, copy);

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView style={styles.flex} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Review
          copy={copy}
          kind={isAnnouncement ? 'announcement' : isService ? 'service' : 'other'}
          intro={fill(isAnnouncement ? copy.introAnnouncement : copy.intro, { recipients })}
          message={composedMessage}
          onMessageChange={setMessageOverride}
          edited={flow.messageOverride !== null}
          onUseSuggested={() => setMessageOverride(null)}
          tone={flow.tone}
          onToneChange={flow.setTone}
          sendLabel={sendLabel(isAnnouncement ? recipientCount : undefined, copy)}
          hasRecipients={recipientCount > 0}
          onBack={prevStep}
          onSend={startSendJob}
          onWhatYoullNeed={() => setChecklistOpen(true)}
          checklistRef={checklistButton}
        >
          {isService && (
            <>
              <TouchableOpacity
                style={styles.sampleToggle}
                onPress={() => {
                  if (!sampleOpen) {
                    AccessibilityInfo.announceForAccessibility(SHARE_SERVICE_SAMPLE);
                  }
                  setSampleOpen((v) => !v);
                }}
                accessibilityRole="button"
                accessibilityLabel={copy.sample}
                accessibilityState={{ expanded: sampleOpen }}
              >
                <Text style={styles.sampleToggleText}>{copy.sample}</Text>
              </TouchableOpacity>
              {sampleOpen && <Text style={styles.sample}>{SHARE_SERVICE_SAMPLE}</Text>}
            </>
          )}
        </Review>
      </ScrollView>
      <WhatYoullNeedSheet visible={checklistOpen} onClose={() => setChecklistOpen(false)} onDismiss={focusChecklistButton} />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing[3], paddingTop: spacing[4] },
  sampleToggle: { minHeight: 44, minWidth: 44, justifyContent: 'center' },
  sampleToggleText: { fontSize: 14, color: ACCENT },
  sample: { fontSize: 14, color: MUTED, lineHeight: 22 },
});
