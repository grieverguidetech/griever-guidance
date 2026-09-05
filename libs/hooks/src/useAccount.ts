import { useCallback, useEffect, useState } from 'react';
import type { Account, AuthProvider } from '@griever/shared';
import type { SendFlowStorage } from './useSendFlow.js';

export interface UseAccountResult {
  account: Account | null;
  hasAccount: boolean;
  /** D1 — social sign-in imports contacts; mocked, no real OAuth. */
  createAccount: (provider: AuthProvider, patch?: Partial<Account>) => Account;
  updateAccount: (patch: Partial<Account>) => void;
}

const STORAGE_KEY = 'gg.account.v1';

function load(storage: SendFlowStorage | undefined): Account | null {
  if (!storage) return null;
  try {
    const raw = storage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Account) : null;
  } catch {
    return null;
  }
}

function save(storage: SendFlowStorage | undefined, account: Account | null): void {
  if (!storage) return;
  try {
    if (account) storage.setItem(STORAGE_KEY, JSON.stringify(account));
    else storage.removeItem(STORAGE_KEY);
  } catch {
    // storage unavailable — account still works for this tab's lifetime
  }
}

export function useAccount(storage?: SendFlowStorage): UseAccountResult {
  const [account, setAccount] = useState<Account | null>(() => load(storage));

  useEffect(() => {
    save(storage, account);
  }, [storage, account]);

  const createAccount = useCallback((provider: AuthProvider, patch?: Partial<Account>) => {
    const created: Account = {
      authProvider: provider,
      contactSource: provider === 'password' ? 'manual' : 'import',
      email: '',
      emailVerified: false,
      senderName: '',
      ...patch,
    };
    setAccount(created);
    return created;
  }, []);

  const updateAccount = useCallback((patch: Partial<Account>) => {
    setAccount((current) => (current ? { ...current, ...patch } : current));
  }, []);

  return { account, hasAccount: account !== null, createAccount, updateAccount };
}
