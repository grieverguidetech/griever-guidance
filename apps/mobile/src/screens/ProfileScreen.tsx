import { useEffect, useRef, useState } from 'react';
import { Text, View } from 'react-native';
import type { UseSupabaseIdentityResult } from '@griever/hooks';
import { ErrorText, Field, LinkButton, PrimaryButton, ScreenHeader, announce, authStyles } from '../components/authForm';
import { NAME_REQUIRED } from './SignUpScreen';

export const SESSION_ENDED = "You've been signed out. Your work on this device is safe. Sign in again when you're ready.";

type Props = {
  identity: UseSupabaseIdentityResult;
  /** A name typed at sign-up that is not saved yet; shown in the field until it is. */
  initialName?: string | null;
  /** The server ended the session: keep the typed name and offer sign in. */
  sessionEnded?: boolean;
  onSignOut: () => void;
  onSignInAgain: () => void;
};

export function ProfileScreen({ identity, initialName, sessionEnded, onSignOut, onSignInAgain }: Props) {
  const savedName = identity.profile?.senderName?.trim() ?? '';
  const source = initialName ?? savedName;
  const [name, setName] = useState(source);
  const [pending, setPending] = useState(false);
  const [saved, setSaved] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const touched = useRef(false);

  // Fill the field from the account until the person starts typing; never overwrite their typing.
  useEffect(() => {
    if (!touched.current && !sessionEnded) setName(source);
  }, [source, sessionEnded]);

  const needsName = !sessionEnded && !savedName && !initialName;

  async function save() {
    if (pending) return;
    if (!name.trim()) return setLocalError(NAME_REQUIRED);
    setLocalError(null);
    setPending(true);
    setSaved(false);
    try {
      const ok = await identity.updateSenderName(name.trim());
      setSaved(ok);
      if (ok) announce('Saved.');
    } finally {
      setPending(false);
    }
  }

  return (
    <View>
      <ScreenHeader>{needsName ? 'What should we call you?' : 'Your account'}</ScreenHeader>
      {needsName ? <Text style={authStyles.body}>This is the name on your account.</Text> : null}
      {identity.offline ? (
        <Text style={authStyles.body}>You are offline. You can change your name when you are connected.</Text>
      ) : null}
      {sessionEnded ? <Text accessibilityLiveRegion="polite" style={authStyles.body}>{SESSION_ENDED}</Text> : null}
      <Field
        label="Your name"
        value={name}
        onChangeText={(v) => {
          touched.current = true;
          setName(v);
          setLocalError(null);
        }}
        textContentType="name"
        autoComplete="name"
        autoCapitalize="words"
        returnKeyType="go"
        onSubmitEditing={sessionEnded ? undefined : save}
      />
      <ErrorText message={localError ?? (sessionEnded ? null : identity.error)} />
      <View accessibilityLiveRegion="polite">{saved ? <Text style={authStyles.body}>Saved.</Text> : null}</View>
      {sessionEnded ? (
        <PrimaryButton label="Sign in" pending={false} onPress={onSignInAgain} />
      ) : (
        <>
          <PrimaryButton label={pending ? 'Saving' : 'Save'} pending={pending} onPress={save} />
          <LinkButton label="Sign out" onPress={onSignOut} />
        </>
      )}
    </View>
  );
}
