/**
 * Builds an `sms:` deep link that opens the device's own Messages app with
 * one recipient and the message pre-filled. The user still taps Send
 * themselves — no web page or app can do that on their behalf; that's an
 * OS-level anti-spam protection, not a gap to work around.
 *
 * iOS and Android disagree on the separator before `body`, and neither
 * follows the RFC 5724 `sms:` URI spec exactly (iOS doesn't officially
 * support a body at all, but honors it via `&` in practice). This isn't the
 * capability-detection UA-sniffing that tasks/03-contacts.md warned against
 * — both syntaxes always exist at the URI-scheme level; this only picks
 * which one the current OS actually honors. `isIOS` is supplied by the
 * caller (web: a UA check; mobile: `Platform.OS === 'ios'`) so this stays
 * free of any DOM or React Native reference (CLAUDE.md rule 4).
 */
export function buildSmsLink(phone: string, message: string, isIOS: boolean): string {
  const separator = isIOS ? '&' : '?';
  return `sms:${phone}${separator}body=${encodeURIComponent(message)}`;
}

/** Web's `isIOS` source — a UA check, not a capability probe (see above). */
export function isIOSUserAgent(userAgent: string): boolean {
  return /iPad|iPhone|iPod/.test(userAgent);
}

/**
 * There's no direct way to feature-detect "can this device open sms: links
 * and does it likely have a Messages app" — a laptop can technically have a
 * `sms:` protocol handler registered and a phone technically might not, so
 * this is a plausibility signal, not a guarantee (tasks/04-sending.md §5:
 * "detect by whether sms: handoff is plausible, and say it plainly rather
 * than showing a disabled button"). A coarse pointer (touchscreen) is the
 * primary signal; the UA check is a fallback for browsers that don't
 * support the media query.
 */
export function smsHandoffPlausible(
  userAgent: string,
  matchMediaFn?: (query: string) => { matches: boolean },
): boolean {
  if (matchMediaFn) {
    try {
      return matchMediaFn('(pointer: coarse)').matches;
    } catch {
      // matchMedia unavailable in this environment — fall through to the UA check
    }
  }
  return /iPhone|iPad|iPod|Android/i.test(userAgent);
}
