import { useRef, useState } from 'react';
import { Text, View } from 'react-native';
import type { TextInput } from 'react-native';
import { useSignUp } from '@clerk/expo';
import { ErrorText, Field, LinkButton, PrimaryButton, ScreenHeader, authStyles } from '../components/authForm';
import { SocialButtons } from '../components/SocialButtons';
import { clerkMessage } from '../lib/clerkMessages';

type Props = {
  onSwitchToSignIn: () => void;
  /** Called just before the new session starts, with the typed name. The account route saves it (see AccountScreen). */
  onCreated: (name: string, email: string) => void;
};

export const MIN_PASSWORD_LENGTH = 8;
export const PASSWORD_HINT = `Use at least ${MIN_PASSWORD_LENGTH} characters.`;
export const NAME_REQUIRED = 'Please enter your name.';
const PASSWORD_TOO_SHORT = `Please choose a password with at least ${MIN_PASSWORD_LENGTH} characters.`;

export function SignUpScreen({ onSwitchToSignIn, onCreated }: Props) {
  const { signUp } = useSignUp();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState<'form' | 'code'>('form');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const emailRef = useRef<TextInput>(null);
  const passwordRef = useRef<TextInput>(null);

  async function run(action: () => Promise<void>) {
    if (pending) {
      return;
    }
    setPending(true);
    setError(null);
    try {
      await action();
    } catch (thrown) {
      setError(clerkMessage(thrown));
    } finally {
      setPending(false);
    }
  }

  /** Returns true when Clerk reported an error (and it is now on screen). */
  function failed({ error: clerkError }: { error: unknown }): boolean {
    if (clerkError) {
      setError(clerkMessage(clerkError));
    }
    return Boolean(clerkError);
  }

  const submit = () =>
    run(async () => {
      // Checked here so a typing mistake never costs a network call.
      if (!name.trim()) {
        return setError(NAME_REQUIRED);
      }
      if (password.length < MIN_PASSWORD_LENGTH) {
        return setError(PASSWORD_TOO_SHORT);
      }
      if (failed(await signUp.password({ emailAddress: email.trim(), password }))) {
        return;
      }
      if (!failed(await signUp.verifications.sendEmailCode())) {
        setStep('code');
      }
    });

  const verify = () =>
    run(async () => {
      if (failed(await signUp.verifications.verifyEmailCode({ code: code.trim() }))) {
        return;
      }
      if (signUp.status !== 'complete') {
        return setError(clerkMessage(null));
      }
      // The session starts at finalize and this screen unmounts, so hand the name up first.
      onCreated(name.trim(), email.trim());
      failed(await signUp.finalize());
    });

  const resend = () =>
    run(async () => {
      failed(await signUp.verifications.sendEmailCode());
    });

  if (step === 'code') {
    return (
      <View>
        <ScreenHeader>Check your email</ScreenHeader>
        <Text style={authStyles.body}>{`We sent a 6-digit code to ${email.trim()}.`}</Text>
        <Field
          label="6-digit code"
          value={code}
          onChangeText={setCode}
          keyboardType="number-pad"
          textContentType="oneTimeCode"
          autoComplete="sms-otp"
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="go"
          onSubmitEditing={verify}
        />
        <ErrorText message={error} />
        <PrimaryButton label={pending ? 'Checking' : 'Create account'} pending={pending} onPress={verify} />
        <LinkButton label="Send a new code" onPress={() => void resend()} />
        <LinkButton
          label="Use a different email"
          onPress={() => {
            setCode('');
            setError(null);
            setStep('form');
          }}
        />
      </View>
    );
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
      <ErrorText message={error} />
      <PrimaryButton label={pending ? 'Creating account' : 'Create account'} pending={pending} onPress={submit} />
      <SocialButtons onStart={() => setError(null)} onError={setError} />
      <LinkButton label="I already have an account" onPress={onSwitchToSignIn} />
    </View>
  );
}
