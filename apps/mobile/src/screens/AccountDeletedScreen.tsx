import { useEffect, useRef } from 'react';
import type { ComponentRef } from 'react';
import { BackHandler, StyleSheet, Text, View } from 'react-native';
import { screenCopy } from '@griever/copy';
import { spacing } from '@griever/tokens';
import { Button, Heading } from '../ui';
import { focusNode } from '../ui/focusNode';
import { Body } from '../ui/Text';

const copy = screenCopy('account');
const phoneAccount = screenCopy('phoneAccount');

/**
 * Shown after the account is deleted, as on web. `cleared` is null while this phone is being cleared (the button waits), and false when it could not be fully
 * cleared. Screen-reader focus lands on the heading. The calm line says what happened and nothing more.
 */
export function AccountDeletedScreen({ cleared, onDone }: { cleared: boolean | null; onDone: () => void }) {
  const heading = useRef<ComponentRef<typeof Text>>(null);
  // Deferred a tick, as on the checklist panel, so the screen reader takes focus after the swap has drawn.
  useEffect(() => {
    const timer = setTimeout(() => focusNode(heading.current), 0);
    return () => clearTimeout(timer);
  }, []);
  // Android Back leaves the same way the button does: the account is gone, so there is no screen behind this one.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (cleared !== null) {
        onDone();
      }
      return true;
    });
    return () => sub.remove();
  }, [onDone, cleared]);
  return (
    <View style={styles.screen}>
      <Heading level={1} headingRef={heading}>
        {copy.deletedHeading}
      </Heading>
      <Body>{copy.deletedBody}</Body>
      {cleared === null ? <Body live>{phoneAccount.deletedClearing}</Body> : null}
      {cleared === false ? <Body live>{copy.deletedLeftover}</Body> : null}
      <Button label={copy.deletedAction} ariaDisabled={cleared === null} announceDisabled onPress={() => cleared !== null && onDone()} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { gap: spacing[3] },
});
