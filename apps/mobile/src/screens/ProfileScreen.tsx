import { useState } from 'react';
import { Text, View } from 'react-native';
import type { UseSupabaseIdentityResult } from '@griever/hooks';
import { ErrorText, Field, LinkButton, PrimaryButton, authStyles } from '../components/authForm';

export function ProfileScreen({ identity }: { identity: UseSupabaseIdentityResult }) {
  const [name, setName] = useState(identity.profile?.senderName ?? '');
  const [pending, setPending] = useState(false);
  const [saved, setSaved] = useState(false);

  async function save() {
    if (pending) return;
    setPending(true);
    setSaved(false);
    try {
      setSaved(await identity.updateSenderName(name.trim()));
    } finally {
      setPending(false);
    }
  }

  return (
    <View>
      <Text accessibilityRole="header" style={authStyles.title}>Your account</Text>
      {identity.offline ? (
        <Text style={authStyles.body}>You are offline. Your name will save when you are connected.</Text>
      ) : null}
      <Field label="Your name" value={name} onChangeText={setName} textContentType="name" autoComplete="name" />
      <ErrorText message={identity.error} />
      <View accessibilityLiveRegion="polite">{saved ? <Text style={authStyles.body}>Saved.</Text> : null}</View>
      <PrimaryButton label={pending ? 'Saving' : 'Save'} pending={pending} onPress={save} />
      <LinkButton label="Sign out" onPress={() => void identity.signOut()} />
    </View>
  );
}
