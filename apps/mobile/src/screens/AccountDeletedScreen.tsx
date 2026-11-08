import { useEffect, useRef } from 'react';
import type { ComponentRef } from 'react';
import { BackHandler, StyleSheet, Text, View } from 'react-native';
import { screenCopy } from '@griever/copy';
import { spacing } from '@griever/tokens';
import { Button, Heading } from '../ui';
import { focusNode } from '../ui/focusNode';
import { Body } from '../ui/Text';

const copy = screenCopy('account');

/**
 * Shown after the account is deleted, as on web. `cleared` is false when this phone could not be fully
 * cleared. Screen-reader focus lands on the heading. The calm line says what happened and nothing more.
 */
export function AccountDeletedScreen({ cleared = true, onDone }: { cleared?: boolean; onDone: () => void }) {
  const heading = useRef<ComponentRef<typeof Text>>(null);
  // Deferred a tick, as on the checklist panel, so the screen reader takes focus after the swap has drawn.
  useEffect(() => {
    const timer = setTimeout(() => focusNode(heading.current), 0);
    return () => clearTimeout(timer);
  }, []);
  // Android Back leaves the same way the button does: the account is gone, so there is no screen behind this one.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      onDone();
      return true;
    });
    return () => sub.remove();
  }, [onDone]);
  return (
    <View style={styles.screen}>
      <Heading level={1} headingRef={heading}>
        {copy.deletedHeading}
      </Heading>
      <Body>{copy.deletedBody}</Body>
      {cleared ? null : <Body>{copy.deletedLeftover}</Body>}
      <Button label={copy.deletedAction} onPress={onDone} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { gap: spacing[3] },
});
