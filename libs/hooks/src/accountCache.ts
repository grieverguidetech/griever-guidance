import type { AccountContactSource, AccountType } from '@griever/shared';

export const PROFILE_STORAGE_KEY = 'gg.profile.v1';

/** The only profile fields kept on the device. No contact or message data. */
export interface CachedProfile {
  /** The user this cache belongs to; a cache for anyone else is discarded at boot. */
  id: string;
  senderName: string | null;
  /** Private details the person chose to add. Absent in caches written before they existed. */
  fullName?: string | null;
  birthDate?: string | null;
  contactSource: AccountContactSource | null;
  /** Cached so an offline boot still hides "create" for members (C5). */
  accountType: AccountType;
}

const MESSAGES = {
  email_taken: 'This email already has an account. Sign in instead.',
  invalid_credentials: "That email and password don't match. Please try again.",
  rate_limited: 'Too many tries. Please wait a few minutes and try again.',
  offline: "You need a connection to do this. Nothing you've typed is lost.",
  unavailable: "We can't reach your account right now. Please try again in a little while.",
  weak_password: 'Please choose a stronger password.',
  invalid_email: "That doesn't look like an email address. Please check it and try again.",
} as const;

/** Maps any failure reason to calm copy (C7). An unknown reason reads as "unavailable". */
export function identityErrorMessage(reason: string): string {
  return Object.hasOwn(MESSAGES, reason) ? MESSAGES[reason as keyof typeof MESSAGES] : MESSAGES.unavailable;
}
