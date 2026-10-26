import { useRef, useState, type ComponentRef } from 'react';
import { TextInput, View } from 'react-native';
import { useSignIn } from '@clerk/expo';
import { fill, screenCopy } from '@griever/copy';
import { ErrorText, Field, Intro, LinkButton, Notice, PrimaryButton, ScreenHeader, announce } from '../components/authForm';
import { SocialButtons } from '../components/SocialButtons';
import { NEUTRAL_STOP, clerkMessage } from '../lib/clerkMessages';

type Props = {
  onSwitchToSignUp: () => void;
  /** Called with the email just before signing in, so the route can drop state tied to another account. */
  onAttempt: (email: string) => void;
};

const copy = screenCopy('signIn');

export const NEW_CODE_SENT = copy.code.newCodeSent;

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
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const passwordRef = useRef<ComponentRef<typeof TextInput>>(null);

  async function run(busyText: string, action: () => Promise<void>) {
    if (pending) {
      return;
    }
    setPending(true);
    setError(null);
    setNotice(null);
    announce(busyText);
    try {
      await action();
    } catch (thrown) {
      setError(clerkMessage(thrown, step === 'code' ? 'code' : 'password'));
    } finally {
      setPending(false);
    }
  }

  /** Returns true when Clerk reported an error (and it is now on screen). */
  function failed({ error: clerkError }: { error: unknown }, flow: 'password' | 'code' = 'password'): boolean {
    if (clerkError) {
      setError(clerkMessage(clerkError, flow));
    }
    return Boolean(clerkError);
  }

  async function afterFirstStep() {
    if (signIn.status === 'complete') {
      failed(await signIn.finalize());
    } else if (signIn.status === 'needs_client_trust') {
      if (!failed(await signIn.mfa.sendEmailCode(), 'code')) {
        setAfterPassword(true);
        setStep('code');
      }
    } else {
      setError(NEUTRAL_STOP);
    }
  }

  const signInWithPassword = () =>
    run(copy.busyAnnounce, async () => {
      onAttempt(email.trim());
      if (!failed(await signIn.password({ emailAddress: email.trim(), password }))) {
        await afterFirstStep();
      }
    });

  const sendCode = () =>
    run(copy.emailCodeBusy, async () => {
      if (!email.trim()) {
        return setError(clerkMessage({ code: 'form_param_format_invalid' }));
      }
      onAttempt(email.trim());
      if (failed(await signIn.create({ identifier: email.trim() }), 'code')) {
        return;
      }
      if (!failed(await signIn.emailCode.sendCode({ emailAddress: email.trim() }), 'code')) {
        setAfterPassword(false);
        setStep('code');
      }
    });

  const resendCode = () =>
    run(copy.code.resendBusy, async () => {
      if (!failed(afterPassword ? await signIn.mfa.sendEmailCode() : await signIn.emailCode.sendCode(), 'code')) {
        setNotice(NEW_CODE_SENT);
        announce(NEW_CODE_SENT);
      }
    });

  const verifyCode = () =>
    run(copy.code.busyAnnounce, async () => {
      const result = afterPassword ? await signIn.mfa.verifyEmailCode({ code: code.trim() }) : await signIn.emailCode.verifyCode({ code: code.trim() });
      if (!failed(result, 'code')) {
        await afterFirstStep();
      }
    });

  async function startOver() {
    await signIn.reset();
    setCode('');
    setError(null);
    setNotice(null);
    setStep('form');
  }

  if (step === 'code') {
    return (
      <View key={step}>
        <ScreenHeader>{copy.code.heading}</ScreenHeader>
        <Intro>{fill(copy.code.intro, { email: email.trim() })}</Intro>
        <Field
          label={copy.code.label}
          value={code}
          onChangeText={setCode}
          keyboardType="number-pad"
          textContentType="oneTimeCode"
          autoComplete="sms-otp"
          autoCapitalize="none"
          autoCorrect={false}
          maxLength={6}
          returnKeyType="go"
          onSubmitEditing={verifyCode}
        />
        <ErrorText message={error} />
        <Notice message={notice} />
        <PrimaryButton label={pending ? copy.code.submitBusy : copy.code.submit} pending={pending} onPress={verifyCode} />
        <LinkButton label={copy.code.resend} pending={pending} onPress={() => void resendCode()} />
        <LinkButton label={copy.code.differentEmail} onPress={() => void startOver()} />
      </View>
    );
  }

  return (
    <View key={step}>
      <ScreenHeader>{copy.heading}</ScreenHeader>
      <Intro>{copy.intro}</Intro>
      <Field
        label={copy.emailLabel}
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
        label={copy.passwordLabel}
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
      <PrimaryButton label={pending ? copy.submitBusy : copy.submit} pending={pending} onPress={signInWithPassword} />
      <LinkButton label={copy.emailCode} pending={pending} onPress={() => void sendCode()} />
      <SocialButtons onStart={() => setError(null)} onError={setError} />
      <LinkButton label={copy.createAccount} onPress={onSwitchToSignUp} />
    </View>
  );
}
