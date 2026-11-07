import { useMemo } from 'react';
import type { Session } from '@griever/hooks';
import { useAccount } from './AccountProvider';

/**
 * The name the signed-in account offers for the thank-you: the sender name, else the first name.
 * Empty when there is no account or no name on it. On-device only (DS-7): it is shown in the send
 * flow and used for the card status, never written to the person.
 */
export function useAccountSenderName(): string {
  const profile = useAccount()?.profile;
  return profile?.senderName?.trim() || profile?.firstName?.trim() || '';
}

/**
 * A read-only view of the person for status lines: the account name stands in for a missing
 * sender name. The saved person is never changed, and the view is never saved.
 */
export function withAccountName(session: Session, accountName: string): Session {
  if (!accountName || session.senderName) {
    return session;
  }
  return { ...session, senderName: accountName };
}

export function useSessionWithAccountName(session: Session): Session {
  const accountName = useAccountSenderName();
  return useMemo(() => withAccountName(session, accountName), [session, accountName]);
}
