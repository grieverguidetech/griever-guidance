/**
 * The first word of a contact's name, for greeting them. Returns '' when there is nothing to
 * greet: an empty name, or a first word that has a digit or no letter (a phone number, for
 * example). Nothing is stored; this is read from the contact's name when sending (C4).
 */
export function firstName(name: string): string {
  const first = name.trim().split(/\s+/)[0] ?? '';
  if (!/\p{L}/u.test(first) || /\d/.test(first)) {
    return '';
  }
  return first;
}

/** Puts the first name on its own line above the message. With no name, the message is unchanged. */
export function withGreeting(first: string, message: string): string {
  if (first === '') {
    return message;
  }
  return `${first},\n${message}`;
}
