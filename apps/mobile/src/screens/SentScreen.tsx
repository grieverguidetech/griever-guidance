import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import type { FlowProps } from '../app/App';

interface Props extends FlowProps {
  onViewHistory: () => void;
}

export function SentScreen({ flow, onViewHistory }: Props) {
  const { selectedContactIds, fields, reset } = flow;
  const name = fields['deceasedName'] ?? '';
  const recipientCount = selectedContactIds.length;

  return (
    <View style={styles.container}>
      <View style={styles.iconWrapper}>
        <Text style={styles.icon}>✓</Text>
      </View>
      <Text style={styles.heading}>Your messages have been sent.</Text>
      <Text style={styles.body}>
        {recipientCount}{' '}
        {recipientCount === 1 ? 'person' : 'people'} will receive details
        {name ? ` about ${name}` : ''}.
      </Text>
      <Text style={styles.condolence}>We are sorry for your loss.</Text>
      <TouchableOpacity onPress={reset} style={styles.link}>
        <Text style={styles.linkText}>Send another message</Text>
      </TouchableOpacity>
      <TouchableOpacity onPress={onViewHistory} style={styles.historyLink}>
        <Text style={styles.historyLinkText}>View sent messages</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  iconWrapper: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#eef0fb',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  icon: { fontSize: 24, color: '#6B7FD4', fontWeight: '700' },
  heading: {
    fontSize: 20,
    fontWeight: '600',
    color: '#111827',
    textAlign: 'center',
    marginBottom: 12,
  },
  body: {
    fontSize: 14,
    color: '#6b7280',
    textAlign: 'center',
    marginBottom: 4,
  },
  condolence: {
    fontSize: 14,
    color: '#9ca3af',
    textAlign: 'center',
    marginBottom: 40,
  },
  link: {},
  linkText: { fontSize: 14, color: '#6B7FD4' },
  historyLink: { marginTop: 8 },
  historyLinkText: { fontSize: 14, color: '#9ca3af' },
});
