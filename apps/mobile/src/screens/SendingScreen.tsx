import { useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, Linking, Platform, AppState, StyleSheet } from 'react-native';
import type { AppStateStatus } from 'react-native';
import { buildSmsLink } from '@griever/hooks';
import { useMockContacts } from '@griever/hooks';
import type { FlowProps } from '../app/App';

const UNDO_WINDOW_MS = 2000;

/**
 * One contact at a time, texted from the griever's own number — not a bulk
 * send. "Open Messages" hands off to the device's native Messages app (an
 * sms: link) with the contact and message pre-filled; the griever taps Send
 * there themselves. Returning to this screen (via AppState, RN's equivalent
 * of the web's visibilitychange) assumes it went through and auto-advances
 * after a short undo window.
 */
export function SendingScreen({ flow }: FlowProps) {
  const { sendJob, markActiveSent, markActiveSkipped } = flow;
  const contacts = useMockContacts();
  const [pendingAdvance, setPendingAdvance] = useState(false);
  const awaitingReturnRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const active = sendJob?.recipients.find((r) => r.status === 'sending') ?? null;
  const activeContact = active ? contacts.find((c) => c.contactId === active.contactId) : null;

  useEffect(() => {
    function handleAppStateChange(next: AppStateStatus) {
      if (next !== 'active' || !awaitingReturnRef.current) return;
      awaitingReturnRef.current = false;
      setPendingAdvance(true);
      timerRef.current = setTimeout(() => {
        setPendingAdvance(false);
        markActiveSent();
      }, UNDO_WINDOW_MS);
    }
    const sub = AppState.addEventListener('change', handleAppStateChange);
    return () => sub.remove();
  }, [markActiveSent]);

  useEffect(() => {
    setPendingAdvance(false);
    awaitingReturnRef.current = false;
    if (timerRef.current) clearTimeout(timerRef.current);
  }, [active?.contactId]);

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    [],
  );

  if (!sendJob) return null;

  const total = sendJob.recipients.length;
  const activeIndex = active ? sendJob.recipients.findIndex((r) => r.contactId === active.contactId) : -1;

  function undo() {
    if (timerRef.current) clearTimeout(timerRef.current);
    setPendingAdvance(false);
  }

  function openMessages() {
    if (!active || !activeContact) return;
    const link = buildSmsLink(activeContact.phone, flow.composedMessage, Platform.OS === 'ios');
    awaitingReturnRef.current = true;
    Linking.openURL(link);
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Texting people, one at a time</Text>
      <Text style={styles.subtitle}>
        Each message opens in your own Messages app. You send it — we just line them up.
      </Text>

      {active && activeContact && (
        <View style={styles.card}>
          <Text style={styles.eyebrow}>
            {activeIndex + 1} of {total}
          </Text>
          <Text style={styles.name}>{activeContact.name}</Text>
          <Text style={styles.message}>{flow.composedMessage}</Text>

          {pendingAdvance ? (
            <View style={styles.row}>
              <Text style={styles.sentText}>Sent to {activeContact.name}</Text>
              <TouchableOpacity onPress={undo}>
                <Text style={styles.undoText}>Undo</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.row}>
              <TouchableOpacity style={styles.primaryButton} onPress={openMessages} activeOpacity={0.8}>
                <Text style={styles.primaryButtonText}>Open Messages</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.skipButton} onPress={markActiveSkipped} activeOpacity={0.8}>
                <Text style={styles.skipButtonText}>Skip</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#ffffff', padding: 24, paddingTop: 60 },
  title: { fontSize: 20, fontWeight: '600', color: '#111827', marginBottom: 8 },
  subtitle: { fontSize: 14, color: '#9ca3af', marginBottom: 24 },
  card: {
    backgroundColor: '#f9fafb',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 12,
    padding: 20,
  },
  eyebrow: { fontSize: 12, color: '#9ca3af', marginBottom: 4 },
  name: { fontSize: 16, fontWeight: '600', color: '#111827', marginBottom: 12 },
  message: { fontSize: 13, color: '#374151', lineHeight: 20, marginBottom: 16 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  primaryButton: {
    flex: 1,
    backgroundColor: '#6B7FD4',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  primaryButtonText: { color: '#ffffff', fontSize: 14, fontWeight: '500' },
  skipButton: {
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  skipButtonText: { color: '#6b7280', fontSize: 14 },
  sentText: { fontSize: 14, color: '#3d8a5f' },
  undoText: { fontSize: 14, color: '#6B7FD4', fontWeight: '500' },
});
