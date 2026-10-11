import { useState } from 'react';
import { Text, View } from 'react-native';
import type { UseSupabaseIdentityResult } from '@griever/hooks';
import { ErrorText, Field, LinkButton, PrimaryButton, authStyles } from '../components/authForm';

type Props = {
  identity: UseSupabaseIdentityResult;
  onSwitchToSignIn: () => void;
  /** Called once the account exists, with the typed name. The account route saves it (see AccountScreen). */
  onCreated: (name: string) => void;
};

export function SignUpScreen({ identity, onSwitchToSignIn, onCreated }: Props) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [pending, setPending] = useState(false);

  async function submit() {
    if (pending) return;
    setPending(true);
    try {
      if (await identity.signUp(email.trim(), password)) onCreated(name.trim());
    } finally {
      setPending(false);
    }
  }

  return (
    <View>
      <Text accessibilityRole="header" style={authStyles.title}>Create an account</Text>
      <Text style={authStyles.body}>Your name is used as the sender on messages you send.</Text>
      <Field label="Your name" value={name} onChangeText={setName} textContentType="name" autoComplete="name" />
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
        textContentType="newPassword"
        autoComplete="new-password"
        autoCapitalize="none"
      />
      <ErrorText message={identity.error} />
      <PrimaryButton label={pending ? 'Creating account' : 'Create account'} pending={pending} onPress={submit} />
      <LinkButton label="I already have an account" onPress={onSwitchToSignIn} />
    </View>
  );
}
