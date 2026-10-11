import { useRef, useState } from 'react';
import { Text, View } from 'react-native';
import type { TextInput } from 'react-native';
import type { UseSupabaseIdentityResult } from '@griever/hooks';
import { ErrorText, Field, LinkButton, PrimaryButton, ScreenHeader, authStyles } from '../components/authForm';

type Props = {
  identity: UseSupabaseIdentityResult;
  onSwitchToSignIn: () => void;
  /** Called once the account exists, with the typed name. The account route saves it (see AccountScreen). */
  onCreated: (name: string) => void;
};

export const MIN_PASSWORD_LENGTH = 8;
export const PASSWORD_HINT = `Use at least ${MIN_PASSWORD_LENGTH} characters.`;
export const NAME_REQUIRED = 'Please enter your name.';
const PASSWORD_TOO_SHORT = `Please choose a password with at least ${MIN_PASSWORD_LENGTH} characters.`;

export function SignUpScreen({ identity, onSwitchToSignIn, onCreated }: Props) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [pending, setPending] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const emailRef = useRef<TextInput>(null);
  const passwordRef = useRef<TextInput>(null);

  async function submit() {
    if (pending) return;
    // Checked here so a typing mistake never costs a network call.
    if (!name.trim()) return setLocalError(NAME_REQUIRED);
    if (password.length < MIN_PASSWORD_LENGTH) return setLocalError(PASSWORD_TOO_SHORT);
    setLocalError(null);
    setPending(true);
    try {
      if (await identity.signUp(email.trim(), password)) onCreated(name.trim());
    } finally {
      setPending(false);
    }
  }

  return (
    <View>
      <ScreenHeader>Create an account</ScreenHeader>
      <Text style={authStyles.body}>Your name is used as the sender on messages you send.</Text>
      <Field
        label="Your name"
        value={name}
        onChangeText={setName}
        textContentType="name"
        autoComplete="name"
        autoCapitalize="words"
        returnKeyType="next"
        onSubmitEditing={() => emailRef.current?.focus()}
      />
      <Field
        label="Email"
        inputRef={emailRef}
        value={email}
        onChangeText={setEmail}
        keyboardType="email-address"
        textContentType="emailAddress"
        autoComplete="email"
        autoCapitalize="none"
        autoCorrect={false}
        returnKeyType="next"
        onSubmitEditing={() => passwordRef.current?.focus()}
      />
      <Field
        label="Password"
        inputRef={passwordRef}
        hint={PASSWORD_HINT}
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        textContentType="newPassword"
        autoComplete="new-password"
        autoCapitalize="none"
        returnKeyType="go"
        onSubmitEditing={submit}
      />
      <ErrorText message={localError ?? identity.error} />
      <PrimaryButton label={pending ? 'Creating account' : 'Create account'} pending={pending} onPress={submit} />
      <LinkButton label="I already have an account" onPress={onSwitchToSignIn} />
    </View>
  );
}
