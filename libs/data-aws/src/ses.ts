import { SendEmailCommand, type SESv2Client } from '@aws-sdk/client-sesv2';

export interface SendTextEmail {
  from: string;
  to: string;
  subject: string;
  text: string;
}

export async function sendTextEmail(client: SESv2Client, mail: SendTextEmail): Promise<string> {
  const result = await client.send(
    new SendEmailCommand({
      FromEmailAddress: mail.from,
      Destination: { ToAddresses: [mail.to] },
      Content: {
        Simple: {
          Subject: { Data: mail.subject },
          Body: { Text: { Data: mail.text } },
        },
      },
    }),
  );
  return result.MessageId as string;
}

export interface StoredEmail {
  messageId: string;
  from: string;
  destination: { to: string[]; cc: string[]; bcc: string[] };
  subject: string;
  body: { html?: string; text?: string };
}

/** Reads the emails that the SES stand-in (aws-ses-v2-local) kept. Local only. */
export async function readSentEmails(sesEndpoint: string): Promise<StoredEmail[]> {
  const response = await fetch(`${sesEndpoint}/store`);
  if (!response.ok) throw new Error(`SES stand-in answered ${response.status}`);
  const body = (await response.json()) as { emails: StoredEmail[] };
  return body.emails;
}

export async function clearSentEmails(sesEndpoint: string): Promise<void> {
  await fetch(`${sesEndpoint}/clear-store`, { method: 'POST' });
}

export async function isSesReachable(sesEndpoint: string): Promise<boolean> {
  try {
    const response = await fetch(`${sesEndpoint}/health-check`, { signal: AbortSignal.timeout(1000) });
    return response.ok;
  } catch {
    return false;
  }
}
