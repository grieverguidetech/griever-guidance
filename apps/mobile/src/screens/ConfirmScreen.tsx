import { useRef, useState } from 'react';
import { AccessibilityInfo, findNodeHandle, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Switch, TouchableOpacity } from 'react-native';
import { fill, recipientsPhrase, screenCopy, sendLabel } from '@griever/copy';
import type { UseContactsResult } from '@griever/hooks';
import { firstName, SHARE_SERVICE_SAMPLE } from '@griever/shared';
import { Review, SerifText as Text } from '@griever/ui';
import type { ButtonNode } from '@griever/ui';
import { colors, spacing } from '@griever/tokens';
import type { FlowProps } from '../app/App';
import { WhatYoullNeedSheet } from '../components/WhatYoullNeedSheet';
import { ACCENT, MUTED } from '../components/colors';

const copy = screenCopy('review');

interface Props extends FlowProps {
  /** Used only to show the first picked person's greeting in the preview. */
  contacts?: UseContactsResult;
}

/** The screen is the shared Review in libs/ui; this holds what is mobile only: scrolling and the sample. */
export function ConfirmScreen({ flow, contacts }: Props) {
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
  const firstPicked = contacts?.contacts.find((c) => c.contactId === selectedContactIds[0]);
  const greeting = firstPicked ? firstName(firstPicked.name) : '';
  const preview = flow.greeting && greeting !== '' ? fill(copy.greetingPreview, { greeting: `${greeting},` }) : '';

  function toggleGreeting() {
    const next = !flow.greeting;
    flow.setGreeting(next);
    if (next && greeting !== '') {
      AccessibilityInfo.announceForAccessibilityWithOptions(fill(copy.greetingPreview, { greeting: `${greeting},` }), { queue: true });
    }
  }

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
          <Pressable
            style={styles.greetingRow}
            onPress={toggleGreeting}
            accessibilityRole="switch"
            accessibilityLabel={copy.greetingSwitch}
            accessibilityState={{ checked: flow.greeting }}
          >
            <Text style={styles.greetingLabel} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
              {copy.greetingSwitch}
            </Text>
            <Switch
              value={flow.greeting}
              onValueChange={toggleGreeting}
              trackColor={{ true: ACCENT }}
              importantForAccessibility="no-hide-descendants"
              accessibilityElementsHidden
            />
          </Pressable>
          {preview !== '' && <Text style={styles.sample}>{preview}</Text>}
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
  greetingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 44 },
  greetingLabel: { fontSize: 16, flexShrink: 1, color: colors.ink },
  sample: { fontSize: 14, color: MUTED, lineHeight: 22 },
});
