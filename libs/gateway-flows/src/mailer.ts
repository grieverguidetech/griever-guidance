// The invite email, sent through the Resend HTTP API (text only in v1). C1: an account email never
// carries message content, contacts or the deceased's details, so the input type below has no field
// for any of them.
import { parseInviteEmail } from '@griever/shared';

export interface InviteEmailInput {
  apiKey: string;
  /** The verified sender address (INVITE_FROM_EMAIL). */
  from: string;
  to: string;
  /** The inviter's own sender name. Cleaned before use; may be empty. */
  ownerName: string | null | undefined;
  link: string;
}

export type SendInviteResult =
  | { ok: true }
  | { ok: false; reason: 'rejected' | 'rate_limited' | 'unavailable' };

const RESEND_URL = 'https://api.resend.com/emails';
const MAX_NAME_LENGTH = 100;

/** `${webUrl}/join#t=<token>`. A fragment, never a query, so the token stays out of server logs. */
export function buildInviteLink(webUrl: string, token: string): string {
  const url = new URL(webUrl);
  if (url.protocol !== 'https:' || url.search || url.hash) {
    throw new Error('PUBLIC_WEB_URL must be an https URL with no query or fragment');
  }
  return `${webUrl.replace(/\/+$/, '')}/join#t=${token}`;
}

// Zero-width, bidi-control, BOM and line-separator code points: they can hide or reorder text.
const INVISIBLE = new RegExp('[\\u200b-\\u200d\\u202a-\\u202e\\u2066-\\u2069\\ufeff\\u0085\\u2028\\u2029]', 'g');
// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u001f\u007f]/g;
const URL_SHAPED = /(?:https?:\/\/|www\.)\S*/gi;
const BARE_DOMAIN = /\S+\.[a-z]{2,}\S*/gi;

/** Plain text for the sentence: no URL or domain-shaped text, no hidden characters, at most 100 characters. */
export function cleanOwnerName(raw: string | null | undefined): string {
  return (raw ?? '')
    .replace(INVISIBLE, '')
    .replace(CONTROL, ' ')
    .replace(URL_SHAPED, ' ')
    .replace(BARE_DOMAIN, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_NAME_LENGTH)
    .trim();
}

export function inviteEmailContent(ownerName: string | null | undefined, link: string) {
  const name = cleanOwnerName(ownerName);
  return name
    ? {
        subject: `${name} asked for your help`,
        text: `${name} asked you to help let people know. This link works for 7 days.\n\n${link}\n`,
      }
    : {
        subject: "You've been asked to help",
        text: `You've been asked to help let people know. This link works for 7 days.\n\n${link}\n`,
      };
}

/** One call to Resend. Never throws and never puts the key in the result. */
export async function sendInviteEmail(
  input: InviteEmailInput,
  fetchImpl: typeof fetch = fetch,
): Promise<SendInviteResult> {
  const to = parseInviteEmail(input.to);
  if (!to) return { ok: false, reason: 'rejected' };
  const { subject, text } = inviteEmailContent(input.ownerName, input.link);
  let res: Response;
  try {
    res = await fetchImpl(RESEND_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${input.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: input.from, to: [to], subject, text }),
    });
  } catch {
    return { ok: false, reason: 'unavailable' };
  }
  if (res.ok) return { ok: true };
  if (res.status === 429) return { ok: false, reason: 'rate_limited' };
  // Only a bad request is the caller's input; auth or sender problems are ours to fix.
  if (res.status === 400 || res.status === 422) return { ok: false, reason: 'rejected' };
  return { ok: false, reason: 'unavailable' };
}
