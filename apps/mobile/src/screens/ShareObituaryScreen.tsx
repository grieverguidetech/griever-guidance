import { useEffect, useRef, useState } from 'react';
import type { ComponentRef } from 'react';
import { AccessibilityInfo, BackHandler, findNodeHandle, Keyboard, KeyboardAvoidingView, Platform, StyleSheet, Text } from 'react-native';
import { fill, hasTemplateBlanks, screenCopy } from '@griever/copy';
import { FLOW_DETAIL_MAX_LENGTH, isValidObituaryLink, obituaryLink } from '@griever/shared';
import type { ChecklistItemId, ChecklistItemState } from '@griever/shared';
import type { Session } from '@griever/hooks';
import { ShareObituary } from '../ui';
import type { ButtonNode } from '../ui';
import type { TextInputNode } from '../ui/screens/ShareObituary';
import { colors } from '@griever/tokens';
import { PersonChecklistSheet } from '../components/PersonChecklistSheet';
import { copyText, pasteText } from '../lib/clipboard';
import { checkPublisherEmail, loadPublisherEmail, openMailDraft, savePublisherEmail } from '../lib/mailCompose';
import { obituaryTextFor } from '../lib/obituaryText';

const shareCopy = screenCopy('shareObituary');
const textCopy = screenCopy('phoneObituary');
const draftCopy = screenCopy('obituaryDraft');
const copy = {
  ...shareCopy,
  heading: shareCopy.mobileHeading,
  emailTitle: shareCopy.mobileEmailTitle,
  emailFailed: shareCopy.mobileEmailFailed,
  // Last, so the phone's own words win (emailNoText points at the box above, instead of mobileEmailNoText).
  ...textCopy,
};

type Props = {
  session: Session;
  onChange: (patch: { obituaryUrl?: string; obituaryPublisher?: string; obituaryText?: string | undefined }) => void;
  /** Saves one checklist item on this person, on this phone. */
  onSetItem: (id: ChecklistItemId, state: ChecklistItemState | null) => void;
  onBack: () => void;
  onContinue: () => void;
  /** Done after emailing: the app records it (this person) and goes to Ready to send. */
  onEmailed: () => void;
};

/**
 * The screen is the ShareObituary in apps/mobile/src/ui; this holds what is mobile only: focus, Android
 * Back and the sheet. It passes no drafting handler, so the drafting card is not shown.
 */
export function ShareObituaryScreen({ session, onChange, onSetItem, onBack, onContinue, onEmailed }: Props) {
  const heading = useRef<ComponentRef<typeof Text>>(null);
  const checklistButton = useRef<ButtonNode>(null);
  // The Android focus return waits one tick; an unmount before it runs cancels it.
  const focusTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(focusTimer.current), []);
  const [checklistOpen, setChecklistOpen] = useState(false);
  const [emailFailed, setEmailFailed] = useState(false);
  // Set only by a mail or share result in this visit, so leaving and coming back does not show Done again.
  const [emailed, setEmailed] = useState(false);
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  const [emailNote, setEmailNote] = useState<'opened' | 'shared' | undefined>(undefined);
  const [copied, setCopied] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);
  const [pasteMessage, setPasteMessage] = useState<string | undefined>(undefined);
  const editButton = useRef<ButtonNode>(null);
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState('');
  const [note, setNote] = useState<'saved' | 'follows' | undefined>(undefined);
  // Counts finished edits, so focus returns to the Edit button once it is back on screen.
  const [editsEnded, setEditsEnded] = useState(0);
  // The publisher's address is typed here and kept on this phone only, per person (never part of the session, so it never syncs: DS-7).
  const [address, setAddress] = useState('');
  // The error shows after the field is left or Email is pressed, and goes when the user types again.
  const [addressShown, setAddressShown] = useState(false);
  const addressInput = useRef<TextInputNode | null>(null);
  const addressEdited = useRef(false);
  // What the exits need, kept in refs so Android Back and unmount see the latest typed text.
  const latest = useRef({ editing: false, value: '', shown: '', onChange });
  const emailRunning = useRef(false);
  const [emailBusy, setEmailBusy] = useState(false);
  const sheetOpen = useRef(false);
  sheetOpen.current = checklistOpen;

  // Whether the keyboard is open, so the Done bar can drop its bottom inset (iOS announces the change early).
  useEffect(() => {
    const show = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow', () => setKeyboardOpen(true));
    const hide = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide', () => setKeyboardOpen(false));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

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
    setAddressShown(false);
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
      // While editing: the first Back closes the keyboard; with it closed, Back saves and goes back.
      if (latest.current.editing && Keyboard.isVisible()) {
        Keyboard.dismiss();
        return true;
      }
      leave(onBack);
      return true;
    });
    return () => sub.remove();
    // leave is stable: it only reads refs and setters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onBack]);

  useEffect(() => {
    if (editsEnded === 0) {
      return;
    }
    const focusEdit = () => {
      const handle = editButton.current ? findNodeHandle(editButton.current) : null;
      if (handle) {
        AccessibilityInfo.setAccessibilityFocus(handle);
      }
    };
    // With the keyboard open, wait until it is gone, or focus lands while the screen is still moving.
    if (Keyboard.isVisible()) {
      let done = false;
      const run = () => {
        if (!done) {
          done = true;
          focusEdit();
        }
      };
      const sub = Keyboard.addListener('keyboardDidHide', run);
      const fallback = setTimeout(run, 800);
      return () => {
        sub.remove();
        clearTimeout(fallback);
      };
    }
    const timer = setTimeout(focusEdit, 0);
    return () => clearTimeout(timer);
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
      focusTimer.current = setTimeout(focusChecklistButton, 0);
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
    setAddressShown(false);
    void savePublisherEmail(session.id, value);
  };

  latest.current = { editing, value: editValue, shown: obituaryText, onChange };

  const startEdit = () => {
    setEditValue(obituaryText);
    setNote(undefined);
    setEditing(true);
  };

  // Writes the typed text. Unchanged text writes nothing. An empty box clears it, so the text follows the details again.
  // It only reads refs, so Android Back and unmount can call it too. Returns the line to show.
  const commit = (): 'saved' | 'follows' | undefined => {
    const { editing: wasEditing, value, shown, onChange: change } = latest.current;
    latest.current.editing = false;
    if (!wasEditing) {
      return undefined;
    }
    const typed = value.trim();
    if (typed === shown) {
      return undefined;
    }
    change({ obituaryText: typed === '' ? undefined : typed });
    return typed === '' ? 'follows' : 'saved';
  };

  const saveEdit = () => {
    setNote(commit());
    setEditing(false);
    setEditsEnded((n) => n + 1);
  };

  const cancelEdit = () => {
    latest.current.editing = false;
    setNote(undefined);
    setEditing(false);
    setEditsEnded((n) => n + 1);
  };

  // Every way out of the box saves first (no confirm dialog), then does its action.
  const leave = (go: () => void) => {
    if (latest.current.editing) {
      saveEdit();
    }
    go();
  };

  // Leaving by any other road (a person switch unmounts this screen) saves too, to the person it was opened for.
  useEffect(
    () => () => {
      commit();
    },
    // commit reads refs only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  // Step 1: the user's own mail app (or the share sheet) gets the text; they pick who it goes to (C1).
  const emailPublisher = async () => {
    // A ref, not state: a second tap in the same moment must see the first.
    if (emailRunning.current) {
      return;
    }
    // A wrong address is shown, not guessed at: nothing opens until it is fixed or cleared.
    if (!addressCheck.ok) {
      setAddressShown(true);
      // Every refused press is heard: iOS announces the message, and on both systems focus goes to the field
      // (Android reads the field's hint when it gets focus).
      if (Platform.OS === 'ios') {
        AccessibilityInfo.announceForAccessibility(addressError ?? '');
      }
      setTimeout(() => addressInput.current?.focus(), 0);
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
    if (result === 'mail' || result === 'share') {
      setEmailed(true);
    }
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
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
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
          onBack={() => leave(onBack)}
          onWhatYoullNeed={() => setChecklistOpen(true)}
          onContinue={() => leave(onContinue)}
          onPasteLink={pasteLink}
          pasteMessage={pasteMessage}
          publisherEmail={{ address: { value: address, onChange: changeAddress, onBlur: () => setAddressShown(true), inputRef: addressInput, error: addressShown ? addressError : undefined }, hasText: obituaryText !== '', hasBlanks: hasTemplateBlanks(obituaryText, draftCopy), onPress: emailPublisher, failed: emailFailed, busy: emailBusy, note: emailNote, onCopyText: copyObituary, copied, copyFailed }}
          textEditor={{ text: obituaryText, editing, value: editValue, onValueChange: setEditValue, onEdit: startEdit, onSave: saveEdit, onCancel: cancelEdit, maxLength: FLOW_DETAIL_MAX_LENGTH.obituaryText, note, editRef: editButton }}
          emailed={emailed}
          keyboardOpen={keyboardOpen}
          onDone={() => leave(onEmailed)}
          headingRef={heading}
          checklistRef={checklistButton}
        />
      <PersonChecklistSheet visible={checklistOpen} onClose={closeChecklist} onDismiss={focusChecklistButton} checklist={session.checklist} onSetItem={onSetItem} />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.bg },
});
