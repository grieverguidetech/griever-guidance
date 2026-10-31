import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { SIGNED_IN_STORAGE_KEY, useAccount as useAccountState } from '@griever/hooks';
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

/**
 * What background sync needs from the sign-in provider: who is signed in and a token getter. The
 * object only changes when the status or user does; `getToken` always asks the latest provider.
 * null means accounts are unavailable.
 */
export type SyncAuth = { status: AccountAuth['status']; userId: string | null; getToken: () => Promise<string | null> };
const SyncAuthContext = createContext<SyncAuth | null>(null);

export function useSyncAuth(): SyncAuth | null {
  return useContext(SyncAuthContext);
}

/**
 * What the device knew at launch, for choosing the first screen. `hydrated` flips once the local
 * cache is read; `signedIn` is then the gg.signedIn.v1 marker (set for anyone who has signed in here).
 * null means accounts are unavailable (missing configuration).
 */
export type LaunchState = { hydrated: boolean; signedIn: boolean };
const LaunchContext = createContext<LaunchState | null>(null);

export function useLaunchState(): LaunchState | null {
  return useContext(LaunchContext);
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
  updateDetails: async () => ({ ok: false, invalid: false }),
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

/** The profile cache, read from AsyncStorage once. `ready` flips when it can be trusted. */
function useProfileCache() {
  const storage = useMemo(() => createProfileCache(), []);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let live = true;
    void storage.hydrate().then(() => live && setReady(true));
    return () => {
      live = false;
    };
  }, [storage]);
  return { storage, ready };
}

type ProfileCache = ReturnType<typeof useProfileCache>;

/**
 * The children (the send flow) always render straight away. The account hook starts after the
 * profile cache has loaded, because it reads that cache once at mount; until then accounts show
 * as loading. The send flow never waits on accounts.
 */
function AccountState({ auth, cache, children }: { auth: AccountAuth; cache: ProfileCache; children: ReactNode }) {
  const [account, setAccount] = useState<UseAccountResult>(LOADING);
  const latestAuth = useRef(auth);
  latestAuth.current = auth;
  const { status, userId } = auth;
  const syncAuth = useMemo<SyncAuth>(
    () => ({
      status,
      userId,
      getToken: async () => {
        const result = await latestAuth.current.getToken();
        return result.ok ? result.token : null;
      },
    }),
    [status, userId],
  );
  const launch = useMemo<LaunchState>(
    () => ({ hydrated: cache.ready, signedIn: cache.ready && cache.storage.getItem(SIGNED_IN_STORAGE_KEY) !== null }),
    [cache.ready, cache.storage],
  );
  return (
    <>
      {cache.ready ? <AccountRunner auth={auth} storage={cache.storage} onAccount={setAccount} /> : null}
      <LaunchContext.Provider value={launch}>
        <AccountContext.Provider value={account}>
          <SyncAuthContext.Provider value={syncAuth}>{children}</SyncAuthContext.Provider>
        </AccountContext.Provider>
      </LaunchContext.Provider>
    </>
  );
}

/** For tests and any provider that needs no cache of its own. */
export function AccountStateProvider({ auth, children }: { auth: AccountAuth; children: ReactNode }) {
  return (
    <AccountState auth={auth} cache={useProfileCache()}>
      {children}
    </AccountState>
  );
}

function ClerkAccountState({ children }: { children: ReactNode }) {
  const cache = useProfileCache();
  const auth = useClerkAccountAuth(cache.storage, cache.ready);
  return (
    <AccountState auth={auth} cache={cache}>
      {children}
    </AccountState>
  );
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
