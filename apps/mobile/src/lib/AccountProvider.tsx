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

function Identity({ client, children }: { client: AuthClient; children: ReactNode }) {
  const storage = useMemo(() => createProfileCache(), []);
  const [ready, setReady] = useState(false);
  // The hook reads its cache once at mount, so the cache is filled before the hook mounts.
  useEffect(() => {
    let live = true;
    void storage.hydrate().then(() => live && setReady(true));
    return () => {
      live = false;
    };
  }, [storage]);
  if (!ready) return null;
  return <Hooked client={client} storage={storage}>{children}</Hooked>;
}

function Hooked({
  client,
  storage,
  children,
}: {
  client: AuthClient;
  storage: ReturnType<typeof createProfileCache>;
  children: ReactNode;
}) {
  const identity = useSupabaseIdentity({ client, storage });
  return <AccountContext.Provider value={identity}>{children}</AccountContext.Provider>;
}

export function AccountProvider({ client, children }: { client: AuthClient | null; children: ReactNode }) {
  if (!client) return <AccountContext.Provider value={null}>{children}</AccountContext.Provider>;
  return <Identity client={client}>{children}</Identity>;
}
