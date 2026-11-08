import { useEffect, useRef } from 'react';
import type { ComponentRef } from 'react';
import { AccessibilityInfo, findNodeHandle, StyleSheet, Text, View } from 'react-native';
import { screenCopy } from '@griever/copy';
import { spacing } from '@griever/tokens';
import { Button, Heading } from '../ui';
import { Body } from '../ui/Text';

const copy = screenCopy('account');

/**
 * Shown after the account is deleted, as on web. `cleared` is false when this phone could not be fully
 * cleared. Screen-reader focus lands on the heading. The calm line says what happened and nothing more.
 */
export function AccountDeletedScreen({ cleared = true, onDone }: { cleared?: boolean; onDone: () => void }) {
  const heading = useRef<ComponentRef<typeof Text>>(null);
  useEffect(() => {
    const handle = heading.current ? findNodeHandle(heading.current) : null;
    if (handle) {
      AccessibilityInfo.setAccessibilityFocus(handle);
    }
  }, []);
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
