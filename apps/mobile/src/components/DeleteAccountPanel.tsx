import { useEffect, useId, useRef, useState } from 'react';
import type { ComponentRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { spacing } from '@griever/tokens';
import { Button } from '../ui/Button';
import { focusNode } from '../ui/focusNode';
import type { ButtonNode } from '../ui/Button';
import { Heading } from '../ui/Heading';
import { Status } from '../ui/Status';
import { Body } from '../ui/Text';

/** The words the panel needs: the `delete…` keys of libs/copy/screens/account.json. */
export interface DeleteAccountCopy {
  deleteHeading: string;
  deleteHint: string;
  deleteOpen: string;
  deleteConfirmHeading: string;
  deleteConfirmBody: string;
  deleteConfirmAction: string;
  deleteCancel: string;
  deleting: string;
  deleteFailed: string;
  deleteCancelled: string;
  /** The phone-only line for a delete that needs a fresh sign-in first (phoneAccount.deleteNeedsSignIn). */
  deleteNeedsSignIn: string;
}

/** `deleted`: the account is gone. `cancelled`: the person closed Clerk's verify step. `needsSignIn`: Clerk wants a fresh sign-in first (the phone cannot show its verify step). `failed`: anything else. Only `deleted` removes anything. */
export type DeleteOutcome = 'deleted' | 'cancelled' | 'needsSignIn' | 'failed';

type Step = 'idle' | 'confirm' | 'deleting';

/**
 * "Delete account", as on web: one button opens the confirm step in place (not a Modal), and only the
 * second, deliberate button deletes. Opening moves screen-reader focus to the confirm heading; Cancel
 * returns it to the opener. It is only ever shown in Your account (C9).
 */
export function DeleteAccountPanel({ copy, onDelete }: { copy: DeleteAccountCopy; onDelete: () => Promise<DeleteOutcome> }) {
  const [step, setStep] = useState<Step>('idle');
  const [problem, setProblem] = useState<'none' | 'cancelled' | 'needsSignIn' | 'failed'>('none');
  const statusId = useId();
  const opener = useRef<ButtonNode>(null);
  const confirmHeading = useRef<ComponentRef<typeof Text>>(null);
  const wasConfirming = useRef(false);
  // A ref as well as state: two quick taps can both run before a re-render shows `deleting`.
  const running = useRef(false);

  // Deferred a tick, as on the checklist panel, so the screen reader takes focus after the swap has drawn.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    if (step === 'confirm' && !wasConfirming.current) {
      timer = setTimeout(() => focusNode(confirmHeading.current), 0);
    } else if (step === 'idle' && wasConfirming.current) {
      timer = setTimeout(() => focusNode(opener.current), 0);
    }
    wasConfirming.current = step !== 'idle';
    return () => clearTimeout(timer);
  }, [step]);

  async function confirm() {
    if (running.current) {
      return;
    }
    running.current = true;
    setProblem('none');
    setStep('deleting');
    let outcome: DeleteOutcome = 'failed';
    try {
      outcome = await onDelete();
    } catch {
      outcome = 'failed';
    }
    running.current = false;
    if (outcome !== 'deleted') {
      // Nothing changed. The status line says so, and focus goes back to the confirm heading on the next
      // frame (the same as web), after any system sheet that was shown has gone.
      setProblem(outcome === 'cancelled' || outcome === 'needsSignIn' ? outcome : 'failed');
      setStep('confirm');
      const refocus = () => focusNode(confirmHeading.current);
      if (typeof requestAnimationFrame === 'function') {
        requestAnimationFrame(refocus);
      } else {
        setTimeout(refocus, 0);
      }
    }
  }

  function cancel() {
    if (running.current) {
      return;
    }
    setProblem('none');
    setStep('idle');
  }

  const deleting = step === 'deleting';
  let message: string | undefined;
  if (deleting) {
    message = copy.deleting;
  } else if (problem === 'cancelled') {
    message = copy.deleteCancelled;
  } else if (problem === 'needsSignIn') {
    message = copy.deleteNeedsSignIn;
  } else if (problem === 'failed') {
    message = copy.deleteFailed;
  }
  return (
    <View style={styles.group}>
      <Heading level={2}>{copy.deleteHeading}</Heading>
      {step === 'idle' ? (
        <>
          {/* Read once, as the button's hint; the visible words are hidden from the screen reader so they are not read twice. */}
          <Body tone="muted" hidden>
            {copy.deleteHint}
          </Body>
          <Button label={copy.deleteOpen} variant="secondary" hint={copy.deleteHint} buttonRef={opener} onPress={() => setStep('confirm')} />
        </>
      ) : (
        <View style={styles.group}>
          <Heading level={3} headingRef={confirmHeading}>
            {copy.deleteConfirmHeading}
          </Heading>
          <Body>{copy.deleteConfirmBody}</Body>
          <Button label={copy.deleteCancel} ariaDisabled={deleting} announceDisabled onPress={cancel} />
          <Button label={copy.deleteConfirmAction} variant="secondary" ariaDisabled={deleting} announceDisabled onPress={() => void confirm()} />
        </View>
      )}
      <Status id={statusId} message={message} tone={problem === 'failed' ? 'danger' : 'muted'} />
    </View>
  );
}

const styles = StyleSheet.create({
  group: { gap: spacing[2] },
});
