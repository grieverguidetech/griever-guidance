import { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, Linking, Platform, StyleSheet } from 'react-native';
import { buildSmsLink } from '@griever/hooks';
import type { UseContactsResult } from '@griever/hooks';
import type { FlowProps } from '../app/App';

interface Props extends FlowProps {
  contacts: UseContactsResult;
}

/**
 * One contact at a time, texted from the griever's own number — not a bulk
 * send. "Open Messages" hands off to the device's native Messages app (an
 * sms: link) with the contact and message pre-filled; the griever taps Send
 * there themselves, comes back, and taps "Next" to move on. It's one tap, not a
 * "did that send?" question. Nothing is inferred from the app going to the
 * background and coming back.
 */
export function SendingScreen({ flow, contacts }: Props) {
  const { sendJob, markActiveSent, markActiveSkipped } = flow;
  const [handedOff, setHandedOff] = useState(false);

  const active = sendJob?.recipients.find((r) => r.status === 'sending') ?? null;
  const activeContact = active ? contacts.contacts.find((c) => c.contactId === active.contactId) : null;

  // A fresh recipient became active — the hand-off belonged to the last person.
  useEffect(() => {
    setHandedOff(false);
  }, [active?.contactId]);

  if (!sendJob) return null;

  const total = sendJob.recipients.length;
  const activeIndex = active ? sendJob.recipients.findIndex((r) => r.contactId === active.contactId) : -1;
  const isLast = activeIndex === total - 1;

  function openMessages() {
    if (!active || !activeContact) return;
    const link = buildSmsLink(activeContact.phone, flow.composedMessage, Platform.OS === 'ios');
    setHandedOff(true);
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

          {handedOff ? (
            <View>
              <Text style={styles.sentText}>
                Send it in Messages, then come back and tap {isLast ? 'Done' : 'Next'}.
              </Text>
              <TouchableOpacity style={[styles.primaryButton, styles.nextButton]} onPress={markActiveSent} activeOpacity={0.8}>
                <Text style={styles.primaryButtonText}>{isLast ? 'Done' : 'Next'}</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={openMessages} style={styles.againButton}>
                <Text style={styles.undoText}>Open Messages again</Text>
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
  nextButton: { flex: 0, marginTop: 12 },
  againButton: { alignItems: 'center', paddingVertical: 12 },
  undoText: { fontSize: 14, color: '#6B7FD4', fontWeight: '500' },
});
