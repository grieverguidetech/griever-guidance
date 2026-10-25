import { identityErrorMessage } from '@griever/hooks';

/** For a sign-in that stopped on a step this app has no screen for (such as a second factor). */
export const NEUTRAL_STOP = "That didn't finish. Please try another way to sign in.";
const CODE_NOT_SENT = "We couldn't send a code to that email. Please check it and try again.";
export const FACEBOOK_NO_EMAIL = 'Please use your email or Google to sign in.';
const WRONG_CODE = "That code doesn't match. Please check it and try again.";
const EXPIRED_CODE = 'That code has expired. Please ask for a new one.';

// Clerk error codes, mapped to the reasons `identityErrorMessage` already has copy for (C7).
const REASONS: Record<string, string> = {
  network_error: 'offline',
  form_password_incorrect: 'invalid_credentials',
  form_identifier_not_found: 'invalid_credentials',
  form_password_or_identifier_incorrect: 'invalid_credentials',
  form_identifier_exists: 'email_taken',
  form_param_format_invalid: 'invalid_email',
  form_password_pwned: 'weak_password',
  form_password_length_too_short: 'weak_password',
  form_password_not_strong_enough: 'weak_password',
  too_many_requests: 'rate_limited',
};

function codeOf(error: unknown): string | undefined {
  const e = error as { code?: unknown; errors?: Array<{ code?: unknown }> } | null | undefined;
  const code = e?.code ?? e?.errors?.[0]?.code;
  return typeof code === 'string' ? code : undefined;
}

/**
 * Calm copy for any error Clerk returns or throws. Unknown codes read as "can't reach your account".
 * On the email-code path an unknown email says nothing about a password.
 */
export function clerkMessage(error: unknown, flow: 'password' | 'code' = 'password'): string {
  const code = codeOf(error);
  if (flow === 'code' && (code === 'form_identifier_not_found' || code === 'form_password_or_identifier_incorrect')) {
    return CODE_NOT_SENT;
  }
  if (code === 'form_code_incorrect') {
    return WRONG_CODE;
  }
  if (code === 'verification_expired') {
    return EXPIRED_CODE;
  }
  return identityErrorMessage((code && REASONS[code]) || 'unavailable');
}
