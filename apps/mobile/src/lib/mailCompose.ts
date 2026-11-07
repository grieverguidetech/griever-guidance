import { Linking, Share } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as MailComposer from 'expo-mail-composer';

export interface MailDraft {
  /** The publisher's address, if the user typed one. Exactly one address (see checkPublisherEmail). */
  to?: string;
  subject: string;
  body: string;
}

export type MailResult = 'mail' | 'share' | 'dismissed' | 'failed';

export type PublisherEmailCheck = { ok: true; address: string | undefined } | { ok: false; reason: 'many' | 'invalid' };

/**
 * Checks the typed "Publisher's email". It is optional, so empty is fine. Exactly one address: a comma or
 * semicolon (or a space between two) is refused. The shape check is lenient on purpose (something@something.something);
 * the mail app and the publisher's server are the real judges.
 */
export function checkPublisherEmail(raw: string): PublisherEmailCheck {
  const address = raw.trim();
  if (address === '') {
    return { ok: true, address: undefined };
  }
  if (/[,;]/.test(address)) {
    return { ok: false, reason: 'many' };
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) {
    return { ok: false, reason: 'invalid' };
  }
  return { ok: true, address };
}

/**
 * Where the publisher's email is kept: one AsyncStorage key per person, on this phone only (DS-7, C3, C4).
 * It is deliberately not a field of the person's session and not in SYNCED_KEYS, so nothing can sync it.
 */
export const PUBLISHER_EMAIL_KEY_PREFIX = 'gg.publisherEmail.v1.';
export const publisherEmailKey = (personId: string): string => PUBLISHER_EMAIL_KEY_PREFIX + personId;

/** The saved address for this person, or '' when none or when the phone can't read it. */
export async function loadPublisherEmail(personId: string): Promise<string> {
  try {
    return (await AsyncStorage.getItem(publisherEmailKey(personId))) ?? '';
  } catch {
    return '';
  }
}

/** Saves (or, when empty, removes) this person's address. A failed save is silent: the field still works for this visit. */
export async function savePublisherEmail(personId: string, value: string): Promise<void> {
  try {
    if (value.trim() === '') {
      await AsyncStorage.removeItem(publisherEmailKey(personId));
    } else {
      await AsyncStorage.setItem(publisherEmailKey(personId), value);
    }
  } catch {
    // Nothing is lost that the user can't type again.
  }
}

/** Forgets the saved addresses of these people (retention, or a person removed by sync). */
export async function clearPublisherEmails(personIds: readonly string[]): Promise<void> {
  await Promise.all(personIds.map((id) => savePublisherEmail(id, '')));
}

/**
 * A `mailto:` link. `to` goes in the path; with no recipient the user fills in To. Subject and body are
 * percent-encoded; encodeURIComponent writes a space as %20 and a line break as %0D%0A.
 */
export function buildMailto({ to, subject, body }: MailDraft): string {
  // Mail apps expect CRLF (RFC 6068) for a line break in the body.
  const crlfBody = body.replace(/\r?\n/g, '\r\n');
  return `mailto:${to ? encodeURIComponent(to) : ''}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(crlfBody)}`;
}

/**
 * Opens the in-app compose sheet (expo-mail-composer) when the phone has mail set up. Returns undefined
 * when it can't be used, so the caller falls back.
 */
async function composeInApp({ to, subject, body }: MailDraft): Promise<MailResult | undefined> {
  // Only this check may fall back. Once the sheet is asked to open, a failure is reported as failed:
  // a second draft (mailto:) after a failed first one could confuse the user.
  try {
    if (!(await MailComposer.isAvailableAsync())) {
      return undefined;
    }
  } catch {
    return undefined;
  }
  try {
    const { status } = await MailComposer.composeAsync({ recipients: to ? [to] : [], subject, body });
    // 'cancelled' means the user closed the sheet with nothing saved or sent. Android always reports sent.
    return (status as string) === 'cancelled' ? 'dismissed' : 'mail';
  } catch {
    return 'failed';
  }
}

/**
 * Opens a mail draft (C1: the user taps Send themselves, nothing is sent by us). Order: the in-app compose
 * sheet, then a `mailto:` link, then the share sheet with the same text. Returns what happened so the screen
 * can say so calmly.
 *
 * RN 0.88 docs: Linking.openURL rejects when the system can't open the URL; Share.share needs `message`
 * or `url`. We call openURL directly, not canOpenURL, because iOS answers false for `mailto:` unless it is
 * listed in LSApplicationQueriesSchemes. Neither Apple nor RFC 6068 gives a mailto length limit, so no cap
 * is applied here; a long obituary on a real phone is a HUMAN TODO on #629.
 */
export async function openMailDraft(draft: MailDraft): Promise<MailResult> {
  const inApp = await composeInApp(draft);
  if (inApp) {
    return inApp;
  }
  try {
    await Linking.openURL(buildMailto(draft));
    return 'mail';
  } catch {
    try {
      const shared = await Share.share({ message: draft.body, title: draft.subject }, { subject: draft.subject });
      // iOS says when the user closed the sheet without sharing; then nothing happened and nothing should be claimed.
      return shared.action === Share.dismissedAction ? 'dismissed' : 'share';
    } catch {
      return 'failed';
    }
  }
}
