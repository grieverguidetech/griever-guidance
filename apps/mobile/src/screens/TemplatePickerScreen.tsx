import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import { useTemplates } from '@griever/hooks';
import { categoryLabels } from '@griever/shared';
import type { TemplateCategory } from '@griever/shared';
import type { FlowProps } from '../app/App';

const CATEGORY_ORDER: TemplateCategory[] = ['announcement', 'service', 'aftercare'];

export function TemplatePickerScreen({ flow }: FlowProps) {
  const templates = useTemplates();

  const grouped = CATEGORY_ORDER.map((cat) => ({
    category: cat,
    templates: templates.filter((t) => t.category === cat),
  })).filter((g) => g.templates.length > 0);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Griever Guidance</Text>
      <Text style={styles.subtitle}>
        Choose the type of message you would like to send.
      </Text>
      {grouped.map(({ category, templates: group }) => (
        <View key={category} style={styles.group}>
          <Text style={styles.categoryHeading}>{categoryLabels[category]}</Text>
          {group.map((template) => (
            <TouchableOpacity
              key={template.id}
              style={styles.card}
              onPress={() => {
                flow.setTemplate(template);
                flow.nextStep();
              }}
              activeOpacity={0.7}
            >
              <Text style={styles.cardTitle}>{template.name}</Text>
              <Text style={styles.cardDescription}>{template.description}</Text>
            </TouchableOpacity>
          ))}
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#ffffff' },
  content: { padding: 24, paddingTop: 60 },
  title: { fontSize: 24, fontWeight: '600', color: '#111827', marginBottom: 8 },
  subtitle: { fontSize: 14, color: '#9ca3af', marginBottom: 32 },
  group: { marginBottom: 24 },
  categoryHeading: {
    fontSize: 11,
    fontWeight: '500',
    color: '#9ca3af',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 8,
  },
  card: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 12,
    padding: 20,
    marginBottom: 12,
  },
  cardTitle: { fontSize: 16, fontWeight: '500', color: '#111827', marginBottom: 4 },
  cardDescription: { fontSize: 14, color: '#6b7280' },
});
