/** Where the app remembers that it already tried to fill a user's names from Clerk. */
export const NAMES_PREFILLED_KEY = 'gg.namesPrefilled.v1';

export interface ClerkNames {
  firstName: string | null;
  lastName: string | null;
}

interface KnownProfile {
  firstName?: string | null;
  lastName?: string | null;
  senderName?: string | null;
}

function clean(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

/** True when the account has no first name to sign messages with. An older sender name counts as one. */
export function lacksFirstName(profile: KnownProfile | null): boolean {
  return !clean(profile?.firstName) && !clean(profile?.senderName);
}

/**
 * The names to save from Clerk's user, or null when nothing should be saved: the profile already
 * has a name, or Clerk has no first name. The server sets the sender name from the first name.
 */
export function namesToPrefill(
  profile: KnownProfile | null,
  clerkNames: ClerkNames | undefined,
): { firstName: string; lastName: string | null } | null {
  const firstName = clean(clerkNames?.firstName);
  if (!firstName || clean(profile?.firstName) || clean(profile?.lastName) || clean(profile?.senderName)) {
    return null;
  }
  return { firstName, lastName: clean(clerkNames?.lastName) };
}

export function wasPrefilled(storage: Pick<Storage, 'getItem'>, userId: string): boolean {
  try {
    return storage.getItem(NAMES_PREFILLED_KEY) === userId;
  } catch {
    return false;
  }
}

export function markPrefilled(storage: Pick<Storage, 'setItem'>, userId: string): void {
  try {
    storage.setItem(NAMES_PREFILLED_KEY, userId);
  } catch {
    // Without storage the save may be tried again next visit; it only fills a profile that has no name.
  }
}
