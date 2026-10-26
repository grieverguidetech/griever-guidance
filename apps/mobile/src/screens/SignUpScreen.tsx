import { useRef, useState, type ComponentRef } from 'react';
import { TextInput, View } from 'react-native';
import { useSignUp } from '@clerk/expo';
import { fill, screenCopy } from '@griever/copy';
import { ErrorText, Field, Intro, LinkButton, Notice, PrimaryButton, ScreenHeader, announce } from '../components/authForm';
import { SocialButtons } from '../components/SocialButtons';
import { NEUTRAL_STOP, clerkMessage } from '../lib/clerkMessages';

type Props = {
  onSwitchToSignIn: () => void;
  /** Called just before the new session starts, with the typed name. The account route saves it (see AccountScreen). */
  onCreated: (name: string, email: string) => void;
};

const copy = screenCopy('signUp');

export const MIN_PASSWORD_LENGTH = 8;
export const PASSWORD_HINT = fill(copy.passwordHint, { min: MIN_PASSWORD_LENGTH });
export const NAME_REQUIRED = copy.nameRequired;
const PASSWORD_TOO_SHORT = fill(copy.passwordTooShort, { min: MIN_PASSWORD_LENGTH });

export function SignUpScreen({ onSwitchToSignIn, onCreated }: Props) {
  const { signUp } = useSignUp();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState<'form' | 'code'>('form');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const emailRef = useRef<ComponentRef<typeof TextInput>>(null);
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

  const submit = () =>
    run(copy.busyAnnounce, async () => {
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
      if (!failed(await signUp.verifications.sendEmailCode(), 'code')) {
        setStep('code');
      }
    });

  const verify = () =>
    run(copy.code.busyAnnounce, async () => {
      if (failed(await signUp.verifications.verifyEmailCode({ code: code.trim() }), 'code')) {
        return;
      }
      if (signUp.status !== 'complete') {
        return setError(NEUTRAL_STOP);
      }
      // The session starts at finalize and this screen unmounts, so hand the name up first.
      onCreated(name.trim(), email.trim());
      failed(await signUp.finalize());
    });

  const resend = () =>
    run(copy.code.resendBusy, async () => {
      if (!failed(await signUp.verifications.sendEmailCode(), 'code')) {
        setNotice(copy.code.newCodeSent);
        announce(copy.code.newCodeSent);
      }
    });

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
          onSubmitEditing={verify}
        />
        <ErrorText message={error} />
        <Notice message={notice} />
        <PrimaryButton label={pending ? copy.code.submitBusy : copy.code.submit} pending={pending} onPress={verify} />
        <LinkButton label={copy.code.resend} pending={pending} onPress={() => void resend()} />
        <LinkButton
          label={copy.code.differentEmail}
          onPress={() => {
            setCode('');
            setError(null);
            setNotice(null);
            setStep('form');
          }}
        />
      </View>
    );
  }

  return (
    <View key={step}>
      <ScreenHeader>{copy.heading}</ScreenHeader>
      <Intro>{copy.intro}</Intro>
      <Field
        label={copy.nameLabel}
        value={name}
        onChangeText={setName}
        textContentType="name"
        autoComplete="name"
        autoCapitalize="words"
        returnKeyType="next"
        onSubmitEditing={() => emailRef.current?.focus()}
      />
      <Field
        label={copy.emailLabel}
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
        label={copy.passwordLabel}
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
      <PrimaryButton label={pending ? copy.submitBusy : copy.submit} pending={pending} onPress={submit} />
      <SocialButtons onStart={() => setError(null)} onError={setError} />
      <LinkButton label={copy.haveAccount} onPress={onSwitchToSignIn} />
    </View>
  );
}
