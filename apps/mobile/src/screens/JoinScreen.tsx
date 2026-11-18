import { useEffect, useRef, useState } from 'react';
import type { ComponentRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { screenCopy } from '@griever/copy';
import { spacing } from '@griever/tokens';
import { Button, Heading } from '../ui';
import { focusNode } from '../ui/focusNode';
import { Body } from '../ui/Text';

const copy = screenCopy('join');

/**
 * Where the invitation link has got to (as web's Join):
 * - `invited`: signed out, with a saved link.
 * - `joining`: signed in, the invitation is being accepted.
 * - `unusable`: a dead link (one message for all reasons). The link is dropped.
 * - `conflict`: this account already has people of its own. The link is dropped.
 * - `offline`: no connection, or no answer in time. The link stays saved.
 * - `later`: the server could not do it now. The link stays saved.
 */
export type JoinPhase = 'invited' | 'joining' | 'unusable' | 'conflict' | 'offline' | 'later';

type MessagePhase = Exclude<JoinPhase, 'invited' | 'joining'>;

const MESSAGES: Record<MessagePhase, { heading: string; body: string }> = {
  unusable: { heading: copy.unusableHeading, body: copy.unusableBody },
  conflict: { heading: copy.conflictHeading, body: copy.conflictBody },
  offline: { heading: copy.offlineHeading, body: copy.offlineBody },
  later: { heading: copy.laterHeading, body: copy.laterBody },
};

/** "Joining…" in a polite live region that is already on the screen, filled a moment later so it is read. */
function JoiningStatus() {
  const [text, setText] = useState('');
  useEffect(() => {
    const timer = setTimeout(() => setText(copy.joining), 50);
    return () => clearTimeout(timer);
  }, []);
  return (
    <View style={styles.screen}>
      <Body tone="muted" live>
        {text}
      </Body>
    </View>
  );
}

/**
 * The invitation link's screen (#232). Joining is a status (no heading); every other phase has its
 * own heading, and the screen reader's focus moves to it. Nothing here shows or holds the token.
 */
export function JoinScreen({
  phase,
  onCreateAccount,
  onSignIn,
  onContinue,
}: {
  phase: JoinPhase;
  onCreateAccount: () => void;
  onSignIn: () => void;
  onContinue: () => void;
}) {
  const heading = useRef<ComponentRef<typeof Text>>(null);
  // Deferred a tick so the screen reader takes focus after the swap has drawn.
  useEffect(() => {
    const timer = setTimeout(() => focusNode(heading.current), 0);
    return () => clearTimeout(timer);
  }, [phase]);

  if (phase === 'joining') {
    return <JoiningStatus />;
  }
  const { heading: title, body } = phase === 'invited' ? { heading: copy.heading, body: copy.body } : MESSAGES[phase];
  return (
    <View style={styles.screen}>
      <Heading level={1} headingRef={heading}>
        {title}
      </Heading>
      <Body tone="muted">{body}</Body>
      {phase === 'invited' ? (
        <>
          <Button label={copy.createAccount} onPress={onCreateAccount} />
          <Button label={copy.signIn} variant="secondary" onPress={onSignIn} />
        </>
      ) : (
        <Button label={copy.continue} variant="secondary" onPress={onContinue} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, padding: 24, paddingTop: 20, gap: spacing[3] },
});
