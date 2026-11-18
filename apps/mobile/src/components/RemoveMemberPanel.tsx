import { useEffect, useRef, useState } from 'react';
import type { ComponentRef } from 'react';
import type { Text } from 'react-native';
import { StyleSheet, View } from 'react-native';
import { spacing } from '@griever/tokens';
import { Button } from '../ui/Button';
import type { ButtonNode } from '../ui/Button';
import { focusNode } from '../ui/focusNode';
import { Body } from '../ui/Text';

/** The words the panel needs: the `remove…` keys of libs/copy/screens/phonePeopleHelping.json, with the name already filled in. */
export interface RemoveMemberCopy {
  openLabel: string;
  confirmBody: string;
  confirmAction: string;
  keep: string;
  removing: string;
}

type Step = 'idle' | 'confirm' | 'removing';

/**
 * Remove-a-helper for one row, as on web: a button opens the confirm step in place (not a Modal),
 * and only the confirm button calls `onRemove`. Opening moves screen-reader focus into the step. Keep and a
 * failed removal return it to the row's button. After a successful removal the parent moves focus
 * (the row is usually gone by then), so this panel does not. Only shown to the owner, in Your account (C9).
 */
export function RemoveMemberPanel({ copy, onRemove }: { copy: RemoveMemberCopy; onRemove: () => Promise<boolean> }) {
  const [step, setStep] = useState<Step>('idle');
  const opener = useRef<ButtonNode>(null);
  const confirmLine = useRef<ComponentRef<typeof Text>>(null);
  const wasConfirming = useRef(false);
  const skipRefocus = useRef(false);
  // A ref as well as state: two quick taps can both run before a re-render shows `removing`.
  const running = useRef(false);

  // Deferred a tick so the screen reader takes focus after the swap has drawn.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    if (step === 'confirm' && !wasConfirming.current) {
      timer = setTimeout(() => focusNode(confirmLine.current), 0);
    } else if (step === 'idle' && wasConfirming.current && !skipRefocus.current) {
      timer = setTimeout(() => focusNode(opener.current), 0);
    }
    if (step === 'idle') {
      skipRefocus.current = false;
    }
    wasConfirming.current = step !== 'idle';
    return () => clearTimeout(timer);
  }, [step]);

  async function confirm() {
    if (running.current) {
      return;
    }
    running.current = true;
    setStep('removing');
    let ok = false;
    try {
      ok = await onRemove();
    } catch {
      ok = false;
    }
    running.current = false;
    skipRefocus.current = ok;
    setStep('idle');
  }

  function keep() {
    if (running.current) {
      return;
    }
    setStep('idle');
  }

  if (step === 'idle') {
    return <Button label={copy.openLabel} variant="secondary" buttonRef={opener} onPress={() => setStep('confirm')} />;
  }
  const removing = step === 'removing';
  return (
    <View style={styles.group}>
      <Body textRef={confirmLine}>{copy.confirmBody}</Body>
      <Button
        label={copy.confirmAction}
        variant="secondary"
        busy={removing}
        busyLabel={copy.removing}
        ariaDisabled={removing}
        onPress={() => void confirm()}
      />
      <Button label={copy.keep} ariaDisabled={removing} announceDisabled onPress={keep} />
    </View>
  );
}

const styles = StyleSheet.create({
  group: { gap: spacing[1] },
});
