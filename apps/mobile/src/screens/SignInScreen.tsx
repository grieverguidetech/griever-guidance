import { useRef, useState } from 'react';
import { Text, View } from 'react-native';
import type { TextInput } from 'react-native';
import { useSignIn } from '@clerk/expo';
import { ErrorText, Field, LinkButton, PrimaryButton, ScreenHeader, authStyles } from '../components/authForm';
import { SocialButtons } from '../components/SocialButtons';
import { clerkMessage } from '../lib/clerkMessages';

type Props = {
  onSwitchToSignUp: () => void;
  /** Called with the email just before signing in, so the route can drop state tied to another account. */
  onAttempt: (email: string) => void;
};

// On success the account route re-renders into the profile, so no "done" callback is needed.
export function SignInScreen({ onSwitchToSignUp, onAttempt }: Props) {
  const { signIn } = useSignIn();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState<'form' | 'code'>('form');
  // A new device asks for an email code after the password (Clerk "client trust").
  const [afterPassword, setAfterPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
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

  async function afterFirstStep() {
    if (signIn.status === 'complete') {
      failed(await signIn.finalize());
    } else if (signIn.status === 'needs_client_trust') {
      if (!failed(await signIn.mfa.sendEmailCode())) {
        setAfterPassword(true);
        setStep('code');
      }
    } else {
      setError(clerkMessage(null));
    }
  }

  const signInWithPassword = () =>
    run(async () => {
      onAttempt(email.trim());
      if (!failed(await signIn.password({ emailAddress: email.trim(), password }))) {
        await afterFirstStep();
      }
    });

  const sendCode = () =>
    run(async () => {
      if (!email.trim()) {
        return setError(clerkMessage({ code: 'form_param_format_invalid' }));
      }
      onAttempt(email.trim());
      if (failed(await signIn.create({ identifier: email.trim() }))) {
        return;
      }
      if (!failed(await signIn.emailCode.sendCode({ emailAddress: email.trim() }))) {
        setAfterPassword(false);
        setStep('code');
      }
    });

  const resendCode = () =>
    run(async () => {
      failed(afterPassword ? await signIn.mfa.sendEmailCode() : await signIn.emailCode.sendCode());
    });

  const verifyCode = () =>
    run(async () => {
      const result = afterPassword ? await signIn.mfa.verifyEmailCode({ code: code.trim() }) : await signIn.emailCode.verifyCode({ code: code.trim() });
      if (!failed(result)) {
        await afterFirstStep();
      }
    });

  async function startOver() {
    await signIn.reset();
    setCode('');
    setError(null);
    setStep('form');
  }

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
          onSubmitEditing={verifyCode}
        />
        <ErrorText message={error} />
        <PrimaryButton label={pending ? 'Checking' : 'Sign in'} pending={pending} onPress={verifyCode} />
        <LinkButton label="Send a new code" onPress={() => void resendCode()} />
        <LinkButton label="Use a different email" onPress={() => void startOver()} />
      </View>
    );
  }

  return (
    <View>
      <ScreenHeader>Sign in</ScreenHeader>
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
        returnKeyType="next"
        onSubmitEditing={() => passwordRef.current?.focus()}
      />
      <Field
        label="Password"
        inputRef={passwordRef}
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        textContentType="password"
        autoComplete="current-password"
        autoCapitalize="none"
        returnKeyType="go"
        onSubmitEditing={signInWithPassword}
      />
      <ErrorText message={error} />
      <PrimaryButton label={pending ? 'Signing in' : 'Sign in'} pending={pending} onPress={signInWithPassword} />
      <LinkButton label="Email me a code instead" onPress={() => void sendCode()} />
      <SocialButtons onStart={() => setError(null)} onError={setError} />
      <LinkButton label="Create an account" onPress={onSwitchToSignUp} />
    </View>
  );
}
