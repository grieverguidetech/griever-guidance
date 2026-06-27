import { useEffect, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import { getSendHistory } from '@griever/api-client';
import type { SendEvent } from '@griever/shared';

const TEMP_USER_ID = 'test-user';

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

interface Props {
  onBack: () => void;
}

export function HistoryScreen({ onBack }: Props) {
  const [events, setEvents] = useState<SendEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getSendHistory(TEMP_USER_ID)
      .then(setEvents)
      .finally(() => setLoading(false));
  }, []);

  return (
    <View style={styles.container}>
      <TouchableOpacity onPress={onBack} style={styles.backButton}>
        <Text style={styles.backText}>← Back</Text>
      </TouchableOpacity>

      <Text style={styles.title}>Sent messages</Text>
      <Text style={styles.subtitle}>
        A record of notifications sent from this device.
      </Text>

      {loading && (
        <ActivityIndicator
          size="small"
          color="#9ca3af"
          style={styles.loader}
        />
      )}

      {!loading && events.length === 0 && (
        <Text style={styles.empty}>No messages sent yet.</Text>
      )}

      <FlatList
        data={events}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <Text style={styles.cardName}>
              {item.deceasedName || 'Unnamed'}
            </Text>
            <Text style={styles.cardMeta}>
              {item.recipientCount}{' '}
              {item.recipientCount === 1 ? 'person' : 'people'} notified
              {' · '}{formatDate(item.createdAt)}
            </Text>
            <Text style={styles.cardTemplate}>{item.templateId}</Text>
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#ffffff', paddingHorizontal: 24, paddingTop: 60 },
  backButton: { marginBottom: 24 },
  backText: { fontSize: 14, color: '#9ca3af' },
  title: { fontSize: 20, fontWeight: '600', color: '#111827', marginBottom: 4 },
  subtitle: { fontSize: 14, color: '#9ca3af', marginBottom: 24 },
  loader: { marginTop: 24 },
  empty: { fontSize: 14, color: '#9ca3af', marginTop: 8 },
  list: { paddingBottom: 40 },
  card: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 12,
    padding: 20,
    marginBottom: 12,
  },
  cardName: { fontSize: 14, fontWeight: '500', color: '#111827', marginBottom: 4 },
  cardMeta: { fontSize: 12, color: '#6b7280', marginBottom: 2 },
  cardTemplate: { fontSize: 12, color: '#9ca3af' },
});
