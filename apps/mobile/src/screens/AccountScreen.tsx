import { useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { UseSupabaseIdentityResult } from '@griever/hooks';
import { useAccount } from '../lib/AccountProvider';
import { LinkButton, ScreenHeader, announce, authStyles } from '../components/authForm';
import { MUTED } from '../components/colors';
import { SignInScreen } from './SignInScreen';
import { SignUpScreen } from './SignUpScreen';
import { ProfileScreen } from './ProfileScreen';
import { ChecklistRows } from './WhatYoullNeedScreen';

export const UNAVAILABLE = "Accounts aren't available right now.";
export const CHECK_EMAIL = 'Please check your email to finish setting up your account.';

// A name typed at sign-up stays here until it is saved, even if the person leaves this screen.
// It is tied to the sign-up email so it can never be applied to a different account.
// In memory only, for this app session.
type Unsaved = { email: string; name: string };
const sameEmail = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();
let unsavedName: Unsaved | null = null;
export function resetUnsavedName() {
  unsavedName = null;
}

/** The "What you'll need" list, kept on the signed-in account page. Same saved ticks as the checklist screen. */
function AccountChecklist() {
  const [tipOpen, setTipOpen] = useState<string | null>(null);
  return (
    // A touch on the page outside the info button closes an open tip.
    <View style={styles.checklist} onTouchStart={() => setTipOpen(null)}>
      <Text accessibilityRole="header" style={styles.checklistTitle}>What you'll need</Text>
      <Text style={styles.checklistNote}>Not today. Just so none of it surprises you.</Text>
      <ChecklistRows tipOpen={tipOpen} onTipChange={setTipOpen} />
    </View>
  );
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
  const [pendingName, setPendingNameState] = useState<Unsaved | null>(unsavedName);
  const [awaitingEmail, setAwaitingEmail] = useState(false);
  const [ended, setEnded] = useState(false);
  const explicitSignOut = useRef(false);
  const attempted = useRef<Unsaved | null>(null);
  const { isSignedIn, updateSenderName, clearError, signOut } = identity;

  function setPendingName(next: Unsaved | null) {
    unsavedName = next;
    setPendingNameState(next);
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
      if (!explicitSignOut.current) setEnded(true);
    }
  }
  // Reset outside render; it only matters between a sign-out and the next sign-in.
  useEffect(() => {
    if (isSignedIn) explicitSignOut.current = false;
  }, [isSignedIn]);

  useEffect(() => {
    if (!pendingName || !isSignedIn || attempted.current === pendingName) return;
    attempted.current = pendingName;
    void updateSenderName(pendingName.name).then((ok) => {
      if (ok) clearPending();
    });
  }, [pendingName, isSignedIn, updateSenderName]);

  // Once the account holds the name, the in-memory copy has done its job.
  const savedName = identity.profile?.senderName;
  useEffect(() => {
    if (pendingName && savedName === pendingName.name) clearPending();
  }, [pendingName, savedName]);

  function clearPending() {
    attempted.current = null;
    setPendingName(null);
  }

  function switchMode(next: 'signIn' | 'signUp') {
    clearError();
    setAwaitingEmail(false);
    setMode(next);
  }

  if (identity.isLoading) return <LoadingOrUnavailable text="One moment." />;
  if (isSignedIn || ended) {
    return (
      <>
        <ProfileScreen
          identity={identity}
          initialName={pendingName?.name}
          onSaved={clearPending}
          sessionEnded={ended}
          onSignOut={() => {
            explicitSignOut.current = true;
            clearPending();
            void signOut();
          }}
          onSignInAgain={() => {
            clearError();
            setEnded(false);
            setMode('signIn');
          }}
        />
        {/* Left out of the name prompt, which has one job. */}
        {isSignedIn && (savedName || pendingName) ? <AccountChecklist /> : null}
      </>
    );
  }
  if (awaitingEmail) return <CheckEmail onSignIn={() => switchMode('signIn')} />;
  if (mode === 'signUp') {
    return (
      <SignUpScreen
        identity={identity}
        onSwitchToSignIn={() => switchMode('signIn')}
        onCreated={(name, email) => {
          setPendingName({ name, email });
          setAwaitingEmail(true);
        }}
      />
    );
  }
  return (
    <SignInScreen
      identity={identity}
      onSwitchToSignUp={() => switchMode('signUp')}
      onAttempt={(email) => {
        // Signing in as someone else: the sign-up name is not theirs.
        if (pendingName && !sameEmail(pendingName.email, email)) clearPending();
      }}
    />
  );
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
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'android' ? 'height' : undefined}>
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
  checklist: { marginTop: 32 },
  checklistTitle: { fontSize: 16, fontWeight: '600', color: '#111827', marginBottom: 4 },
  checklistNote: { fontSize: 13, color: MUTED, marginBottom: 16 },
  backText: { fontSize: 14, color: MUTED },
});
