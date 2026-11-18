import { useEffect, useRef, useState } from 'react';
import type { ComponentRef } from 'react';
import type { Text } from 'react-native';
import { StyleSheet, View } from 'react-native';
import type { LeaveOutcome } from '@griever/hooks';
import { spacing } from '@griever/tokens';
import { Button } from '../ui/Button';
import type { ButtonNode } from '../ui/Button';
import { focusNode } from '../ui/focusNode';
import { Heading } from '../ui/Heading';
import { Body } from '../ui/Text';

/** The words the panel needs: the `leave…` keys of libs/copy/screens/phonePeopleHelping.json, with the owner's name filled in. */
export interface LeaveFamilyCopy {
  openLabel: string;
  heading: string;
  body: string;
  action: string;
  keep: string;
  leaving: string;
}

interface Props {
  copy: LeaveFamilyCopy;
  /** Stops helping. 'ok' and 'not_a_member' both mean this person is not a member now. */
  onLeave: () => Promise<LeaveOutcome>;
}

/**
 * Stop helping, as on web: a button opens the confirm step in place (not a Modal), and only the
 * confirm button leaves. Opening moves screen-reader focus to the step's heading; Keep returns it to the
 * button. Keep is the primary button. A failed leave keeps the step open (the parent says why). After a
 * leave that worked the member block is gone, so the parent moves focus and says so. Members only (C11).
 */
export function LeaveFamilyPanel({ copy, onLeave }: Props) {
  const [open, setOpen] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const opener = useRef<ButtonNode>(null);
  const heading = useRef<ComponentRef<typeof Text>>(null);
  const wasOpen = useRef(false);
  // A ref as well as state: two quick taps can both run before a re-render shows `leaving`.
  const running = useRef(false);

  // Deferred a tick so the screen reader takes focus after the swap has drawn.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    if (open && !wasOpen.current) {
      timer = setTimeout(() => focusNode(heading.current), 0);
    } else if (!open && wasOpen.current) {
      timer = setTimeout(() => focusNode(opener.current), 0);
    }
    wasOpen.current = open;
    return () => clearTimeout(timer);
  }, [open]);

  async function confirm() {
    if (running.current) {
      return;
    }
    running.current = true;
    setLeaving(true);
    try {
      await onLeave();
    } catch {
      // The parent shows the reason; the step stays open.
    }
    running.current = false;
    setLeaving(false);
  }

  function keep() {
    if (running.current) {
      return;
    }
    setOpen(false);
  }

  if (!open) {
    return <Button label={copy.openLabel} variant="secondary" buttonRef={opener} onPress={() => setOpen(true)} />;
  }
  return (
    <View style={styles.group}>
      <Heading level={3} headingRef={heading}>
        {copy.heading}
      </Heading>
      <Body>{copy.body}</Body>
      <Button label={copy.keep} ariaDisabled={leaving} announceDisabled onPress={keep} />
      <Button label={copy.action} variant="secondary" busy={leaving} busyLabel={copy.leaving} ariaDisabled={leaving} onPress={() => void confirm()} />
    </View>
  );
}

const styles = StyleSheet.create({
  group: { gap: spacing[2] },
});
