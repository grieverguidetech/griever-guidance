import AsyncStorage from '@react-native-async-storage/async-storage';
import { addDays, parseLooseDate } from '@griever/shared';
import { CONTACT_RETENTION_DAYS } from '@griever/hooks';

/**
 * Web anchors contact retention to the latest service date across every
 * session (see `getContactsRetentionExpiry`). Mobile has no multi-session
 * model yet — `useSendFlow` is the only flow, used once at a time — so this
 * is the same 30-day-past-service rule collapsed onto a single stored date
 * rather than a list of sessions.
 */
const SERVICE_DATE_KEY = 'gg.serviceDate.v1';

export async function recordServiceDate(value: string): Promise<void> {
  const trimmed = value.trim();
  if (!trimmed) return;
  await AsyncStorage.setItem(SERVICE_DATE_KEY, trimmed);
}

/**
 * True once 30+ days have passed since the stored service date. The caller
 * (App.tsx) owns actually clearing contacts — via `useContacts`'s own
 * `clearAll`, so the in-memory list and the store never disagree — this
 * only answers the question and, once it's yes, resets the anchor so the
 * next service date starts a fresh window.
 */
export async function shouldPurgeContacts(): Promise<boolean> {
  const stored = await AsyncStorage.getItem(SERVICE_DATE_KEY);
  const serviceDate = parseLooseDate(stored);
  if (!serviceDate) return false;
  const expiry = addDays(serviceDate, CONTACT_RETENTION_DAYS);
  if (Date.now() < expiry.getTime()) return false;
  await AsyncStorage.removeItem(SERVICE_DATE_KEY);
  return true;
}
