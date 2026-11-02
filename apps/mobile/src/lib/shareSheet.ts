import { Share } from 'react-native';

export type ShareResult = 'opened' | 'failed';

/**
 * Opens the phone's share sheet with the message, so the user can post it to a group or email it
 * (C1: their own action, nothing is sent by us). The caller passes the message without a greeting.
 * Closing the sheet without choosing is not an error. Only a sheet that cannot open is 'failed'.
 */
export async function shareMessage(message: string): Promise<ShareResult> {
  try {
    await Share.share({ message });
    return 'opened';
  } catch {
    return 'failed';
  }
}
