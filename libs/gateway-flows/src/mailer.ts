// The invite email, sent through the Resend HTTP API. C1: an account email never carries message
// content, contacts or the deceased's details, so the input type below has no field for any of them.

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
  return `${webUrl.replace(/\/+$/, '')}/join#t=${token}`;
}

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Plain text for the sentence: no URL-shaped text, no control characters, at most 100 characters. */
export function cleanOwnerName(raw: string | null | undefined): string {
  const cleaned = (raw ?? '')
    .replace(/(?:https?:\/\/|www\.)\S*/gi, ' ')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned.slice(0, MAX_NAME_LENGTH).trim() || 'Someone';
}

export function inviteEmailContent(ownerName: string | null | undefined, link: string) {
  const name = cleanOwnerName(ownerName);
  const sentence = `${name} asked you to help let people know. This link works for 7 days.`;
  return {
    subject: `${name} asked for your help`,
    text: `${sentence}\n\n${link}\n`,
    html: `<p>${escapeHtml(sentence)}</p><p><a href="${escapeHtml(link)}">Open the link</a></p>`,
  };
}

/** One call to Resend. Never throws and never puts the key in the result. */
export async function sendInviteEmail(
  input: InviteEmailInput,
  fetchImpl: typeof fetch = fetch,
): Promise<SendInviteResult> {
  const { subject, text, html } = inviteEmailContent(input.ownerName, input.link);
  let res: Response;
  try {
    res = await fetchImpl(RESEND_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${input.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: input.from, to: [input.to], subject, text, html }),
    });
  } catch {
    return { ok: false, reason: 'unavailable' };
  }
  if (res.ok) return { ok: true };
  if (res.status === 429) return { ok: false, reason: 'rate_limited' };
  if (res.status >= 500) return { ok: false, reason: 'unavailable' };
  return { ok: false, reason: 'rejected' };
}
