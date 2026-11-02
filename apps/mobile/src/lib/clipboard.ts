import * as Clipboard from 'expo-clipboard';

/** Copies text to the clipboard. Returns false when the phone refuses, so the screen can stay calm. */
export async function copyText(text: string): Promise<boolean> {
  try {
    await Clipboard.setStringAsync(text);
    return true;
  } catch {
    return false;
  }
}

/** Reads the clipboard text. An empty string when it is empty or unreadable. */
export async function pasteText(): Promise<string> {
  try {
    return (await Clipboard.getStringAsync()).trim();
  } catch {
    return '';
  }
}
