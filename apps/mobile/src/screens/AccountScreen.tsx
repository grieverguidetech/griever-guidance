import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text } from 'react-native';
import type { UseSupabaseIdentityResult } from '@griever/hooks';
import { useAccount } from '../lib/AccountProvider';
import { LinkButton, authStyles } from '../components/authForm';
import { SignInScreen } from './SignInScreen';
import { SignUpScreen } from './SignUpScreen';
import { ProfileScreen } from './ProfileScreen';

export const UNAVAILABLE = "Accounts aren't available right now.";
export const CHECK_EMAIL = 'Please check your email to finish setting up your account.';

/**
 * Picks sign in, sign up or profile from the identity state. Reached from the first screen.
 *
 * It also owns saving the name typed at sign-up: once sign-up succeeds the state flips to signed in
 * and the sign-up screen unmounts, so a save started there would never run.
 */
function AccountBody({ identity }: { identity: UseSupabaseIdentityResult }) {
  const [mode, setMode] = useState<'signIn' | 'signUp'>('signIn');
  const [createdName, setCreatedName] = useState<string | null>(null);
  const { isSignedIn, updateSenderName } = identity;

  useEffect(() => {
    if (createdName === null || !isSignedIn) return;
    if (createdName) void updateSenderName(createdName);
    setCreatedName(null);
  }, [createdName, isSignedIn, updateSenderName]);

  if (identity.isLoading) return <Text style={authStyles.body}>One moment.</Text>;
  if (isSignedIn) return <ProfileScreen key={identity.profile ? 'loaded' : 'none'} identity={identity} />;
  if (createdName !== null) {
    // Account created but no session yet: email confirmation is on.
    return (
      <>
        <Text accessibilityRole="header" style={authStyles.title}>Check your email</Text>
        <Text accessibilityLiveRegion="polite" style={authStyles.body}>{CHECK_EMAIL}</Text>
        <LinkButton
          label="Sign in"
          onPress={() => {
            setCreatedName(null);
            setMode('signIn');
          }}
        />
      </>
    );
  }
  if (mode === 'signUp') {
    return <SignUpScreen identity={identity} onSwitchToSignIn={() => setMode('signIn')} onCreated={setCreatedName} />;
  }
  return <SignInScreen identity={identity} onSwitchToSignUp={() => setMode('signUp')} />;
}

export function AccountScreen({ onBack }: { onBack: () => void }) {
  const identity = useAccount();
  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Pressable onPress={onBack} style={styles.back} accessibilityRole="button" accessibilityLabel="Back">
        <Text style={styles.backText}>← Back</Text>
      </Pressable>
      {identity ? <AccountBody identity={identity} /> : <Text style={authStyles.body}>{UNAVAILABLE}</Text>}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#ffffff' },
  content: { padding: 24, paddingTop: 60, paddingBottom: 40 },
  back: { minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start', marginBottom: 16 },
  backText: { fontSize: 14, color: '#9ca3af' },
});
