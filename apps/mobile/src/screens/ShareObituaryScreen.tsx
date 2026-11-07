import { useEffect, useRef, useState } from 'react';
import type { ComponentRef } from 'react';
import { AccessibilityInfo, BackHandler, findNodeHandle, Keyboard, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text } from 'react-native';
import { fill, screenCopy } from '@griever/copy';
import { FLOW_DETAIL_MAX_LENGTH, isValidObituaryLink, obituaryLink } from '@griever/shared';
import type { ChecklistItemId, ChecklistItemState } from '@griever/shared';
import type { Session } from '@griever/hooks';
import { ShareObituary } from '../ui';
import type { ButtonNode } from '../ui';
import { colors, spacing } from '@griever/tokens';
import { PersonChecklistSheet } from '../components/PersonChecklistSheet';
import { copyText, pasteText } from '../lib/clipboard';
import { checkPublisherEmail, loadPublisherEmail, openMailDraft, savePublisherEmail } from '../lib/mailCompose';
import { obituaryTextFor } from '../lib/obituaryText';

const shareCopy = screenCopy('shareObituary');
const textCopy = screenCopy('phoneObituary');
const copy = {
  ...shareCopy,
  ...textCopy,
  heading: shareCopy.mobileHeading,
  emailTitle: shareCopy.mobileEmailTitle,
  emailFailed: shareCopy.mobileEmailFailed,
  emailNoText: shareCopy.mobileEmailNoText,
};

type Props = {
  session: Session;
  onChange: (patch: { obituaryUrl?: string; obituaryPublisher?: string; obituaryText?: string }) => void;
  /** Saves one checklist item on this person, on this phone. */
  onSetItem: (id: ChecklistItemId, state: ChecklistItemState | null) => void;
  onBack: () => void;
  onContinue: () => void;
};

/**
 * The screen is the ShareObituary in apps/mobile/src/ui; this holds what is mobile only: focus, Android
 * Back and the sheet. It passes no drafting handler, so the drafting card is not shown.
 */
export function ShareObituaryScreen({ session, onChange, onSetItem, onBack, onContinue }: Props) {
  const heading = useRef<ComponentRef<typeof Text>>(null);
  const checklistButton = useRef<ButtonNode>(null);
  const [checklistOpen, setChecklistOpen] = useState(false);
  const [emailFailed, setEmailFailed] = useState(false);
  const [emailNote, setEmailNote] = useState<'opened' | 'shared' | undefined>(undefined);
  const [copied, setCopied] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);
  const [pasteMessage, setPasteMessage] = useState<string | undefined>(undefined);
  const editButton = useRef<ButtonNode>(null);
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState('');
  const [justSaved, setJustSaved] = useState(false);
  // Counts finished edits, so focus returns to the Edit button once it is back on screen.
  const [editsEnded, setEditsEnded] = useState(0);
  const editingNow = useRef(false);
  editingNow.current = editing;
  // The publisher's address is typed here and kept on this phone only, per person (never part of the session, so it never syncs: DS-7).
  const [address, setAddress] = useState('');
  const [addressTouched, setAddressTouched] = useState(false);
  const addressEdited = useRef(false);
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

  // Loads this person's saved address, unless the user has already started typing.
  useEffect(() => {
    let live = true;
    addressEdited.current = false;
    setAddress('');
    setAddressTouched(false);
    loadPublisherEmail(session.id).then((saved) => {
      if (live && !addressEdited.current) {
        setAddress(saved);
      }
    });
    return () => {
      live = false;
    };
  }, [session.id]);

  // Android Back goes to the hub, as the Back button does. A sheet that is open takes Back first.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (sheetOpen.current) {
        return false;
      }
      // While editing, Back closes the keyboard only, so typed text is never lost by a stray Back.
      if (editingNow.current) {
        Keyboard.dismiss();
        return true;
      }
      onBack();
      return true;
    });
    return () => sub.remove();
  }, [onBack]);

  useEffect(() => {
    if (editsEnded === 0) {
      return;
    }
    const handle = editButton.current ? findNodeHandle(editButton.current) : null;
    if (handle) {
      AccessibilityInfo.setAccessibilityFocus(handle);
    }
  }, [editsEnded]);

  // iOS tells us when the sheet is gone; Android returns to the last focused view by itself.
  const focusChecklistButton = () => {
    const handle = checklistButton.current ? findNodeHandle(checklistButton.current) : null;
    if (handle) {
      AccessibilityInfo.setAccessibilityFocus(handle);
    }
  };

  // onDismiss is iOS only, so on Android focus goes back when the sheet is closed.
  const closeChecklist = () => {
    setChecklistOpen(false);
    if (Platform.OS !== 'ios') {
      setTimeout(focusChecklistButton, 0);
    }
  };

  const linkValid = isValidObituaryLink(session.obituaryUrl);
  const name = session.personName.trim() || copy.nameFallback;
  const obituaryText = obituaryTextFor(session);

  const addressCheck = checkPublisherEmail(address);
  const addressError = addressCheck.ok ? undefined : addressCheck.reason === 'many' ? copy.publisherEmailMany : copy.publisherEmailInvalid;

  const changeAddress = (value: string) => {
    addressEdited.current = true;
    setAddress(value);
    void savePublisherEmail(session.id, value);
  };

  const startEdit = () => {
    setEditValue(obituaryText);
    setJustSaved(false);
    setEditing(true);
  };

  // Saving writes the full text, so the text stops following the details from then on (as on the web).
  const saveEdit = () => {
    onChange({ obituaryText: editValue });
    setEditing(false);
    setJustSaved(true);
    setEditsEnded((n) => n + 1);
  };

  const cancelEdit = () => {
    setEditing(false);
    setEditsEnded((n) => n + 1);
  };

  // Step 1: the user's own mail app (or the share sheet) gets the text; they pick who it goes to (C1).
  const emailPublisher = async () => {
    // A ref, not state: a second tap in the same moment must see the first.
    if (emailRunning.current) {
      return;
    }
    // A wrong address is shown, not guessed at: nothing opens until it is fixed or cleared.
    if (!addressCheck.ok) {
      setAddressTouched(true);
      return;
    }
    emailRunning.current = true;
    // Cleared first, so a second failure changes the message again and is announced again.
    setEmailFailed(false);
    setEmailNote(undefined);
    setCopied(false);
    setCopyFailed(false);
    setEmailBusy(true);
    const result = await openMailDraft({ to: addressCheck.address, subject: fill(copy.emailSubject, { name }), body: obituaryText });
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
          publisherEmail={{ address: { value: address, onChange: changeAddress, onBlur: () => setAddressTouched(true), error: addressTouched ? addressError : undefined }, hasText: obituaryText !== '', onPress: emailPublisher, failed: emailFailed, busy: emailBusy, note: emailNote, onCopyText: copyObituary, copied, copyFailed }}
          textEditor={{ text: obituaryText, editing, value: editValue, onValueChange: setEditValue, onEdit: startEdit, onSave: saveEdit, onCancel: cancelEdit, maxLength: FLOW_DETAIL_MAX_LENGTH.obituaryText, saved: justSaved, editRef: editButton }}
          headingRef={heading}
          checklistRef={checklistButton}
        />
      </ScrollView>
      <PersonChecklistSheet visible={checklistOpen} onClose={closeChecklist} onDismiss={focusChecklistButton} checklist={session.checklist} onSetItem={onSetItem} />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing[3], paddingTop: spacing[4] },
});
