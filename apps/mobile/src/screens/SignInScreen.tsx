import { useState } from 'react';
import { Text, View } from 'react-native';
import type { UseSupabaseIdentityResult } from '@griever/hooks';
import { ErrorText, Field, LinkButton, PrimaryButton, authStyles } from '../components/authForm';

type Props = {
  identity: UseSupabaseIdentityResult;
  onSwitchToSignUp: () => void;
};

// On success the account route re-renders into the profile, so no "done" callback is needed.
export function SignInScreen({ identity, onSwitchToSignUp }: Props) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [pending, setPending] = useState(false);

  async function submit() {
    if (pending) return;
    setPending(true);
    try {
      await identity.signIn(email.trim(), password);
    } finally {
      setPending(false);
    }
  }

  return (
    <View>
      <Text accessibilityRole="header" style={authStyles.title}>Sign in</Text>
      <Text style={authStyles.body}>Sign in to keep your name on your messages.</Text>
      <Field
        label="Email"
        value={email}
        onChangeText={setEmail}
        keyboardType="email-address"
        textContentType="emailAddress"
        autoComplete="email"
        autoCapitalize="none"
        autoCorrect={false}
      />
      <Field
        label="Password"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        textContentType="password"
        autoComplete="current-password"
        autoCapitalize="none"
      />
      <ErrorText message={identity.error} />
      <PrimaryButton label={pending ? 'Signing in' : 'Sign in'} pending={pending} onPress={submit} />
      <LinkButton label="Create an account" onPress={onSwitchToSignUp} />
    </View>
  );
}
