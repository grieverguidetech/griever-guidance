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
  /** The confirm button's full name, for example "Remove Sam Lee". */
  confirmName: string;
  keep: string;
  /** The Keep button's full name, for example "Keep Sam Lee". */
  keepName: string;
  removing: string;
}

interface Props {
  copy: RemoveMemberCopy;
  /** Whether this row's confirm step is showing. The parent owns it so only one step is open at a time. */
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
  /** Resolves true when the helper was removed. */
  onRemove: () => Promise<boolean>;
}

/**
 * Remove-a-helper for one row, as on web: a button opens the confirm step in place (not a Modal),
 * and only the confirm button calls `onRemove`. Opening moves screen-reader focus into the step. Keep and a
 * failed removal return it to the row's button. After a successful removal the parent moves focus
 * (the row is gone by then), so this panel does not. Only shown to the owner, in Your account (C9).
 */
export function RemoveMemberPanel({ copy, open, onOpen, onClose, onRemove }: Props) {
  const [removing, setRemoving] = useState(false);
  const opener = useRef<ButtonNode>(null);
  const confirmLine = useRef<ComponentRef<typeof Text>>(null);
  const wasOpen = useRef(false);
  // Set only when this panel closes itself (Keep or a failure). Another row opening closes this one without taking focus.
  const returnFocus = useRef(false);
  // A ref as well as state: two quick taps can both run before a re-render shows `removing`.
  const running = useRef(false);

  // Deferred a tick so the screen reader takes focus after the swap has drawn.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    if (open && !wasOpen.current) {
      timer = setTimeout(() => focusNode(confirmLine.current), 0);
    } else if (!open && wasOpen.current && returnFocus.current) {
      timer = setTimeout(() => focusNode(opener.current), 0);
    }
    if (!open) {
      returnFocus.current = false;
    }
    wasOpen.current = open;
    return () => clearTimeout(timer);
  }, [open]);

  async function confirm() {
    if (running.current) {
      return;
    }
    running.current = true;
    setRemoving(true);
    let ok = false;
    try {
      ok = await onRemove();
    } catch {
      ok = false;
    }
    running.current = false;
    setRemoving(false);
    returnFocus.current = !ok;
    onClose();
  }

  function keep() {
    if (running.current) {
      return;
    }
    returnFocus.current = true;
    onClose();
  }

  if (!open) {
    return <Button label={copy.openLabel} variant="secondary" buttonRef={opener} onPress={onOpen} />;
  }
  return (
    <View style={styles.group}>
      <Body textRef={confirmLine}>{copy.confirmBody}</Body>
      <Button
        label={copy.confirmAction}
        accessibilityName={copy.confirmName}
        variant="secondary"
        busy={removing}
        busyLabel={copy.removing}
        ariaDisabled={removing}
        onPress={() => void confirm()}
      />
      <Button label={copy.keep} accessibilityName={copy.keepName} ariaDisabled={removing} announceDisabled onPress={keep} />
    </View>
  );
}

const styles = StyleSheet.create({
  group: { gap: spacing[2] },
});
