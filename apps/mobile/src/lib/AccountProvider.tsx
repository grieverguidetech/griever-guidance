import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { useAccount as useAccountState } from '@griever/hooks';
import type { UseAccountResult } from '@griever/hooks';
import type { AccountAuth } from '@griever/shared';
import { createProfileCache } from './authStorage';
import { AUTH_ENABLED } from './features';
import { CLERK_PUBLISHABLE_KEY, ClerkBoundary, useClerkAccountAuth } from './clerk';

/** null means accounts are unavailable (missing configuration). */
const AccountContext = createContext<UseAccountResult | null>(null);

export function useAccount(): UseAccountResult | null {
  return useContext(AccountContext);
}

/** What the account screen sees while the profile cache loads. Every action does nothing. */
const LOADING: UseAccountResult = {
  status: 'loading',
  isSignedIn: false,
  isLoading: true,
  offline: false,
  profile: null,
  error: null,
  clearError: () => undefined,
  signOut: async () => undefined,
  updateSenderName: async () => false,
};

/** Calls the hook and hands the result up. Renders nothing. */
function AccountRunner({
  auth,
  storage,
  onAccount,
}: {
  auth: AccountAuth;
  storage: ReturnType<typeof createProfileCache>;
  onAccount: (account: UseAccountResult) => void;
}) {
  const hook = useAccountState({ auth, storage });
  // The hook returns a new object every render; rebuild only when one of its fields changes.
  /* eslint-disable react-hooks/exhaustive-deps */
  const account = useMemo(
    () => hook,
    [hook.status, hook.offline, hook.profile, hook.error, hook.signOut, hook.updateSenderName, hook.clearError],
  );
  /* eslint-enable react-hooks/exhaustive-deps */
  useEffect(() => onAccount(account), [account, onAccount]);
  return null;
}

/**
 * The children (the send flow) always render straight away. The account hook starts after the
 * profile cache has loaded, because it reads that cache once at mount; until then accounts show
 * as loading. The send flow never waits on accounts.
 */
export function AccountStateProvider({ auth, children }: { auth: AccountAuth; children: ReactNode }) {
  const storage = useMemo(() => createProfileCache(), []);
  const [ready, setReady] = useState(false);
  const [account, setAccount] = useState<UseAccountResult>(LOADING);
  useEffect(() => {
    let live = true;
    void storage.hydrate().then(() => live && setReady(true));
    return () => {
      live = false;
    };
  }, [storage]);
  return (
    <>
      {ready ? <AccountRunner auth={auth} storage={storage} onAccount={setAccount} /> : null}
      <AccountContext.Provider value={account}>{children}</AccountContext.Provider>
    </>
  );
}

function ClerkAccountState({ children }: { children: ReactNode }) {
  return <AccountStateProvider auth={useClerkAccountAuth()}>{children}</AccountStateProvider>;
}

/** Clerk mounts only when the flag is on and the publishable key is set; otherwise accounts are unavailable. */
export function AccountProvider({ children }: { children: ReactNode }) {
  if (!AUTH_ENABLED || !CLERK_PUBLISHABLE_KEY) {
    return <AccountContext.Provider value={null}>{children}</AccountContext.Provider>;
  }
  return (
    <ClerkBoundary publishableKey={CLERK_PUBLISHABLE_KEY}>
      <ClerkAccountState>{children}</ClerkAccountState>
    </ClerkBoundary>
  );
}
