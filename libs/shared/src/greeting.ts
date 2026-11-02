const TITLES = new Set(['dr', 'mr', 'mrs', 'ms', 'mx', 'rev', 'fr', 'sr', 'prof']);
const KINSHIP = new Set(['aunt', 'auntie', 'uncle', 'cousin', 'grandma', 'grandpa']);

/** The word without punctuation at either end: "(Mom)" becomes "Mom". Inside the word is kept. */
function clean(word: string): string {
  return word.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '');
}

function hasLetterNoDigit(word: string): boolean {
  return /\p{L}/u.test(word) && !/\d/.test(word);
}

/**
 * The name to greet a contact with. Returns '' when there is nothing to greet: an empty name, a
 * first word with a digit or no letter (a phone number), or a title ("Dr. Lee"). "Lee, Anna"
 * gives "Anna". A kinship word followed by a name keeps both ("Aunt Sue"). Nothing is stored;
 * this is read from the contact's name when sending (C4).
 */
export function firstName(name: string): string {
  const words = name.trim().split(/\s+/).filter((w) => w !== '');
  if (words.length === 0) {
    return '';
  }
  const lastFirst = words[0].endsWith(',') && words.length > 1;
  const word = clean(lastFirst ? words[1] : words[0]);
  if (!hasLetterNoDigit(word) || TITLES.has(word.toLowerCase())) {
    return '';
  }
  if (!lastFirst && KINSHIP.has(word.toLowerCase()) && words.length > 1) {
    const next = clean(words[1]);
    if (hasLetterNoDigit(next)) {
      return `${word} ${next}`;
    }
  }
  return word;
}

/**
 * Puts the first name on its own line above the message. With no name, or when the message
 * already starts with "{first},", the message is unchanged.
 */
export function withGreeting(first: string, message: string): string {
  if (first === '' || message.startsWith(`${first},`)) {
    return message;
  }
  return `${first},\n${message}`;
}
