import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { useSupabaseIdentity } from '@griever/hooks';
import type { UseSupabaseIdentityResult } from '@griever/hooks';
import type { AuthClient } from '@griever/api-client/auth';
import { createProfileCache } from './authStorage';

/** null means accounts are unavailable (missing configuration). */
const AccountContext = createContext<UseSupabaseIdentityResult | null>(null);

export function useAccount(): UseSupabaseIdentityResult | null {
  return useContext(AccountContext);
}

/** What the account screen sees while the profile cache loads. Every action does nothing. */
const LOADING: UseSupabaseIdentityResult = {
  status: 'loading',
  isSignedIn: false,
  isLoading: true,
  offline: false,
  profile: null,
  error: null,
  clearError: () => undefined,
  signUp: async () => false,
  signIn: async () => false,
  signOut: async () => undefined,
  updateSenderName: async () => false,
};

/** Calls the hook and hands the result up. Renders nothing. */
function IdentityRunner({
  client,
  storage,
  onIdentity,
}: {
  client: AuthClient;
  storage: ReturnType<typeof createProfileCache>;
  onIdentity: (identity: UseSupabaseIdentityResult) => void;
}) {
  const identity = useSupabaseIdentity({ client, storage });
  useEffect(() => {
    onIdentity(identity);
    // `identity` is a new object every render; these fields are what can change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [identity.status, identity.offline, identity.profile, identity.error, identity.signUp, identity.signIn, identity.signOut, identity.updateSenderName, identity.clearError, onIdentity]);
  return null;
}

/**
 * The children (the send flow) always render straight away. The identity hook starts after the
 * profile cache has loaded, because it reads that cache once at mount; until then accounts show
 * as loading. The send flow never waits on accounts.
 */
function Identity({ client, children }: { client: AuthClient; children: ReactNode }) {
  const storage = useMemo(() => createProfileCache(), []);
  const [ready, setReady] = useState(false);
  const [identity, setIdentity] = useState<UseSupabaseIdentityResult>(LOADING);
  useEffect(() => {
    let live = true;
    void storage.hydrate().then(() => live && setReady(true));
    return () => {
      live = false;
    };
  }, [storage]);
  return (
    <>
      {ready ? <IdentityRunner client={client} storage={storage} onIdentity={setIdentity} /> : null}
      <AccountContext.Provider value={identity}>{children}</AccountContext.Provider>
    </>
  );
}

export function AccountProvider({ client, children }: { client: AuthClient | null; children: ReactNode }) {
  if (!client) return <AccountContext.Provider value={null}>{children}</AccountContext.Provider>;
  return <Identity client={client}>{children}</Identity>;
}
