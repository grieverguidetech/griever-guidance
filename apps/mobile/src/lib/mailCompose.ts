import { Linking, Share } from 'react-native';

export interface MailDraft {
  subject: string;
  body: string;
}

export type MailResult = 'mail' | 'share' | 'dismissed' | 'failed';

/**
 * A `mailto:` link with no recipient (the user fills in To). Subject and body are percent-encoded;
 * encodeURIComponent writes a space as %20 and a line break as %0D%0A.
 */
export function buildMailto({ subject, body }: MailDraft): string {
  // Mail apps expect CRLF (RFC 6068) for a line break in the body.
  const crlfBody = body.replace(/\r?\n/g, '\r\n');
  return `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(crlfBody)}`;
}

/**
 * Opens the user's mail app with the draft (C1: their own action, nothing is sent by us). If mail can't
 * open, the share sheet gets the same text. Returns what happened so the screen can say so calmly.
 *
 * RN 0.88 docs: Linking.openURL rejects when the system can't open the URL; Share.share needs `message`
 * or `url`. We call openURL directly, not canOpenURL, because iOS answers false for `mailto:` unless it is
 * listed in LSApplicationQueriesSchemes. Neither Apple nor RFC 6068 gives a mailto length limit, so no cap
 * is applied here; a long obituary on a real phone is a HUMAN TODO on #629.
 */
export async function openMailDraft(draft: MailDraft): Promise<MailResult> {
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
