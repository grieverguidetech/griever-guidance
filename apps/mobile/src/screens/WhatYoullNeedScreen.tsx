import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../app/App';

const CHECKLIST = [
  { label: 'Any will or written wishes', meta: 'Burial or cremation, and who they named', checked: true },
  { label: 'Pre-arranged funeral plans', meta: 'Many people have already paid for this', checked: true },
  { label: 'Social Security number and ID', checked: false },
  { label: 'Life insurance policies', checked: false },
  { label: 'Military discharge papers', meta: 'If they served — it may cover the burial', checked: false },
];

export function WhatYoullNeedScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
        <Text style={styles.backText}>← Back</Text>
      </TouchableOpacity>

      <Text style={styles.title}>What you'll need</Text>
      <Text style={styles.subtitle}>Not today. Just so none of it surprises you.</Text>

      <View style={styles.card}>
        <Text style={styles.cardKicker}>The one people get wrong</Text>
        <Text style={styles.cardTitle}>Certified death certificates</Text>
        <Text style={styles.cardBody}>
          Ask the funeral home for 8 to 10 certified copies. Banks, insurers and Social Security each
          keep an original — photocopies are usually refused.
        </Text>
      </View>

      <Text style={styles.gatherHeading}>Gather when you can</Text>
      {CHECKLIST.map((item) => (
        <View key={item.label} style={styles.checklistItem}>
          <View style={[styles.checkbox, item.checked && styles.checkboxChecked]} />
          <View style={styles.checklistText}>
            <Text style={styles.checklistLabel}>{item.label}</Text>
            {item.meta && <Text style={styles.checklistMeta}>{item.meta}</Text>}
          </View>
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#ffffff' },
  content: { padding: 24, paddingTop: 60 },
  backButton: { marginBottom: 24 },
  backText: { fontSize: 14, color: '#9ca3af' },
  title: { fontSize: 20, fontWeight: '600', color: '#111827', marginBottom: 4 },
  subtitle: { fontSize: 13, color: '#6b7280', marginBottom: 24 },
  card: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
  },
  cardKicker: { fontSize: 11, fontWeight: '500', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 4 },
  cardTitle: { fontSize: 15, fontWeight: '500', color: '#111827', marginBottom: 8 },
  cardBody: { fontSize: 14, color: '#374151', lineHeight: 20 },
  gatherHeading: { fontSize: 11, fontWeight: '500', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 12 },
  checklistItem: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 16 },
  checkbox: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: '#d1d5db', marginRight: 12, marginTop: 2 },
  checkboxChecked: { borderColor: '#6B7FD4', backgroundColor: '#6B7FD4' },
  checklistText: { flex: 1 },
  checklistLabel: { fontSize: 14, color: '#111827' },
  checklistMeta: { fontSize: 12, color: '#9ca3af', marginTop: 2 },
});
