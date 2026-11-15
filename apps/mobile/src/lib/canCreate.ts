import { useAccount } from './AccountProvider';

/**
 * Whether this phone may offer "Create a new one" and "Add someone" (C11). False only for a signed-in
 * member. No account, accounts off, a profile still loading, and an owner all count as true; an old
 * cached profile with no accountType is read as an owner by useAccount.
 * This only hides the buttons. The server enforces C11: the data function refuses a member's create
 * (libs/data-access/src/rules/flows.ts createFlow), and sync drops it.
 */
export function useCanCreate(): boolean {
  return useAccount()?.profile?.accountType !== 'member';
}
