import { useEffect, useRef, useState } from 'react';
import type { ComponentRef } from 'react';
import { AccessibilityInfo, BackHandler, findNodeHandle, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text } from 'react-native';
import { fill, screenCopy } from '@griever/copy';
import { isValidObituaryLink, obituaryLink } from '@griever/shared';
import type { Session } from '@griever/hooks';
import { ShareObituary } from '../ui';
import type { ButtonNode } from '../ui';
import { colors, spacing } from '@griever/tokens';
import { WhatYoullNeedSheet } from '../components/WhatYoullNeedSheet';
import { copyText, pasteText } from '../lib/clipboard';
import { openMailDraft } from '../lib/mailCompose';

const shareCopy = screenCopy('shareObituary');
const copy = {
  ...shareCopy,
  heading: shareCopy.mobileHeading,
  emailTitle: shareCopy.mobileEmailTitle,
  emailFailed: shareCopy.mobileEmailFailed,
  emailNoText: shareCopy.mobileEmailNoText,
};

type Props = {
  session: Session;
  onChange: (patch: { obituaryUrl?: string; obituaryPublisher?: string }) => void;
  onBack: () => void;
  onContinue: () => void;
};

/**
 * The screen is the ShareObituary in apps/mobile/src/ui; this holds what is mobile only: focus, Android
 * Back and the sheet. It passes no drafting handler, so the drafting card is not shown.
 */
export function ShareObituaryScreen({ session, onChange, onBack, onContinue }: Props) {
  const heading = useRef<ComponentRef<typeof Text>>(null);
  const checklistButton = useRef<ButtonNode>(null);
  const [checklistOpen, setChecklistOpen] = useState(false);
  const [emailFailed, setEmailFailed] = useState(false);
  const [emailNote, setEmailNote] = useState<'opened' | 'shared' | undefined>(undefined);
  const [copied, setCopied] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);
  const [pasteMessage, setPasteMessage] = useState<string | undefined>(undefined);
  const emailRunning = useRef(false);
  const [emailBusy, setEmailBusy] = useState(false);
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
  const obituaryText = session.obituaryText?.trim() ?? '';

  // Step 1: the user's own mail app (or the share sheet) gets the text; they pick who it goes to (C1).
  const emailPublisher = async () => {
    // A ref, not state: a second tap in the same moment must see the first.
    if (emailRunning.current) {
      return;
    }
    emailRunning.current = true;
    // Cleared first, so a second failure changes the message again and is announced again.
    setEmailFailed(false);
    setEmailNote(undefined);
    setCopied(false);
    setCopyFailed(false);
    setEmailBusy(true);
    const result = await openMailDraft({ subject: fill(copy.emailSubject, { name }), body: obituaryText });
    emailRunning.current = false;
    setEmailBusy(false);
    setEmailFailed(result === 'failed');
    // A dismissed share sheet means nothing was sent or opened, so no line is shown.
    setEmailNote(result === 'mail' ? 'opened' : result === 'share' ? 'shared' : undefined);
  };

  const copyObituary = async () => {
    // Cleared first, so a repeat is a change the screen reader announces.
    setCopied(false);
    setCopyFailed(false);
    const ok = await copyText(obituaryText);
    setCopied(ok);
    setCopyFailed(!ok);
  };

  const pasteLink = async () => {
    setPasteMessage(undefined);
    const pasted = await pasteText();
    if (pasted === '') {
      setPasteMessage(copy.pasteEmpty);
      return;
    }
    if (!isValidObituaryLink(pasted)) {
      setPasteMessage(copy.pasteNotLink);
      return;
    }
    onChange({ obituaryUrl: pasted });
    setPasteMessage(copy.pasted);
  };
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
          onPasteLink={pasteLink}
          pasteMessage={pasteMessage}
          publisherEmail={{ hasText: obituaryText !== '', onPress: emailPublisher, failed: emailFailed, busy: emailBusy, note: emailNote, onCopyText: copyObituary, copied, copyFailed }}
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
  content: { padding: spacing[3], paddingTop: spacing[4] },
});
