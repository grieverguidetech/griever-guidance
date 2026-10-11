import { useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text } from 'react-native';
import type { UseSupabaseIdentityResult } from '@griever/hooks';
import { useAccount } from '../lib/AccountProvider';
import { LinkButton, ScreenHeader, announce, authStyles } from '../components/authForm';
import { MUTED } from '../components/colors';
import { SignInScreen } from './SignInScreen';
import { SignUpScreen } from './SignUpScreen';
import { ProfileScreen } from './ProfileScreen';

export const UNAVAILABLE = "Accounts aren't available right now.";
export const CHECK_EMAIL = 'Please check your email to finish setting up your account.';

// A name typed at sign-up stays here until it is saved, even if the person leaves this screen.
// In memory only, for this app session.
let unsavedName: string | null = null;
export function resetUnsavedName() {
  unsavedName = null;
}

function CheckEmail({ onSignIn }: { onSignIn: () => void }) {
  useEffect(() => announce(CHECK_EMAIL), []);
  return (
    <>
      <ScreenHeader>Check your email</ScreenHeader>
      <Text accessibilityLiveRegion="polite" style={authStyles.body}>{CHECK_EMAIL}</Text>
      <LinkButton label="Sign in" onPress={onSignIn} />
    </>
  );
}

/**
 * Picks sign in, sign up or profile from the identity state. Reached from the first screen.
 *
 * It also owns saving the name typed at sign-up: once sign-up succeeds the state flips to signed in
 * and the sign-up screen unmounts, so a save started there would never run.
 */
function AccountBody({ identity }: { identity: UseSupabaseIdentityResult }) {
  const [mode, setMode] = useState<'signIn' | 'signUp'>('signIn');
  const [pendingName, setPendingNameState] = useState<string | null>(unsavedName);
  const [awaitingEmail, setAwaitingEmail] = useState(false);
  const [ended, setEnded] = useState(false);
  const explicitSignOut = useRef(false);
  const attempted = useRef<string | null>(null);
  const { isSignedIn, updateSenderName, clearError, signOut } = identity;

  function setPendingName(name: string | null) {
    unsavedName = name;
    setPendingNameState(name);
  }

  // A sign-out nobody asked for (the server ended the session) keeps the view and says so.
  // Done while rendering, not in an effect, so the profile screen (and the typed name) never unmounts.
  const [prevSignedIn, setPrevSignedIn] = useState(isSignedIn);
  if (prevSignedIn !== isSignedIn) {
    setPrevSignedIn(isSignedIn);
    if (isSignedIn) {
      setEnded(false);
    } else {
      setAwaitingEmail(false);
      if (explicitSignOut.current) explicitSignOut.current = false;
      else setEnded(true);
    }
  }

  useEffect(() => {
    if (!pendingName || !isSignedIn || attempted.current === pendingName) return;
    attempted.current = pendingName;
    void updateSenderName(pendingName).then((ok) => {
      if (ok) {
        setPendingName(null);
        attempted.current = null;
      }
    });
  }, [pendingName, isSignedIn, updateSenderName]);

  // Once the account holds the name, the in-memory copy has done its job.
  const savedName = identity.profile?.senderName;
  useEffect(() => {
    if (pendingName && savedName === pendingName) {
      unsavedName = null;
      setPendingNameState(null);
    }
  }, [pendingName, savedName]);

  function switchMode(next: 'signIn' | 'signUp') {
    clearError();
    setAwaitingEmail(false);
    setMode(next);
  }

  if (identity.isLoading) return <LoadingOrUnavailable text="One moment." />;
  if (isSignedIn || ended) {
    return (
      <ProfileScreen
        identity={identity}
        initialName={pendingName}
        sessionEnded={ended}
        onSignOut={() => {
          explicitSignOut.current = true;
          void signOut();
        }}
        onSignInAgain={() => {
          clearError();
          setEnded(false);
          setMode('signIn');
        }}
      />
    );
  }
  if (awaitingEmail) return <CheckEmail onSignIn={() => switchMode('signIn')} />;
  if (mode === 'signUp') {
    return (
      <SignUpScreen
        identity={identity}
        onSwitchToSignIn={() => switchMode('signIn')}
        onCreated={(name) => {
          setPendingName(name);
          setAwaitingEmail(true);
        }}
      />
    );
  }
  return <SignInScreen identity={identity} onSwitchToSignUp={() => switchMode('signUp')} />;
}

function LoadingOrUnavailable({ text }: { text: string }) {
  return (
    <>
      <ScreenHeader>Your account</ScreenHeader>
      <Text style={authStyles.body}>{text}</Text>
    </>
  );
}

export function AccountScreen({ onBack }: { onBack: () => void }) {
  const identity = useAccount();
  // No error left over from an earlier visit should be read out on arrival.
  const clearError = identity?.clearError;
  useEffect(() => clearError?.(), []); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets
      >
        <Pressable onPress={onBack} style={styles.back} accessibilityRole="button" accessibilityLabel="Back">
          <Text style={styles.backText}>← Back</Text>
        </Pressable>
        {identity ? <AccountBody identity={identity} /> : <LoadingOrUnavailable text={UNAVAILABLE} />}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { flex: 1, backgroundColor: '#ffffff' },
  content: { padding: 24, paddingTop: 60, paddingBottom: 40 },
  back: { minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start', marginBottom: 16 },
  backText: { fontSize: 14, color: MUTED },
});
