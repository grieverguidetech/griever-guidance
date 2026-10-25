import { useState } from 'react';
import { View, Text, TouchableOpacity, Pressable, ScrollView, StyleSheet } from 'react-native';
import { useTemplates } from '@griever/hooks';
import { categoryLabels } from '@griever/shared';
import type { TemplateCategory } from '@griever/shared';
import type { FlowProps } from '../app/App';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useNavigation } from '@react-navigation/native';
import type { RootStackParamList } from '../app/App';
import { AUTH_ENABLED, PAYMENTS_ENABLED } from '../lib/features';
import { ACCENT, MUTED, MUTED_STRONG } from '../components/colors';
import { LOCKED_REASON, PaywallPlaceholder } from './PaywallPlaceholder';

const CATEGORY_ORDER: TemplateCategory[] = ['announcement', 'service', 'aftercare'];

// With payments on, the first announcement is free and the rest is in the full plan (#292).
const FREE_CATEGORIES: TemplateCategory[] = ['announcement'];

/** `paymentsEnabled` defaults to the build flag; a prop so tests can set it. */
export function TemplatePickerScreen({ flow, paymentsEnabled = PAYMENTS_ENABLED }: FlowProps & { paymentsEnabled?: boolean }) {
  const [paywallOpen, setPaywallOpen] = useState(false);
  const templates = useTemplates();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  const grouped = CATEGORY_ORDER.map((cat) => ({
    category: cat,
    templates: templates.filter((t) => t.category === cat),
  })).filter((g) => g.templates.length > 0);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Grievers Guidance</Text>
      <Text style={styles.subtitle}>
        Choose the type of message you would like to send.
      </Text>

      <TouchableOpacity
        onPress={() => navigation.navigate('WhatYoullNeed')}
        style={styles.whatYoullNeedLink}
        activeOpacity={0.7}
      >
        <Text style={styles.whatYoullNeedText}>What you'll need</Text>
      </TouchableOpacity>

      {AUTH_ENABLED && (
        <TouchableOpacity
          onPress={() => navigation.navigate('Account')}
          style={styles.accountLink}
          accessibilityRole="button"
          activeOpacity={0.7}
        >
          <Text style={styles.accountLinkText}>Your account</Text>
        </TouchableOpacity>
      )}

      {grouped.map(({ category, templates: group }) => (
        <View key={category} style={styles.group}>
          <Text style={styles.categoryHeading}>{categoryLabels[category]}</Text>
          {group.map((template) =>
            paymentsEnabled && !FREE_CATEGORIES.includes(category) ? (
              // Not the disabled prop: that would swallow the tap. The state tells screen readers instead.
              <Pressable
                key={template.id}
                style={({ pressed }) => [styles.card, pressed && styles.pressed]}
                onPress={() => setPaywallOpen(true)}
                accessibilityRole="button"
                accessibilityState={{ disabled: true }}
                accessibilityHint={LOCKED_REASON}
              >
                <Text style={styles.cardTitle}>{template.name}</Text>
                <Text style={styles.lockedDescription}>{template.description}</Text>
                <Text style={styles.lockedReason}>{LOCKED_REASON}</Text>
              </Pressable>
            ) : (
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
            ),
          )}
        </View>
      ))}
      <PaywallPlaceholder visible={paywallOpen} onClose={() => setPaywallOpen(false)} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#ffffff' },
  content: { padding: 24, paddingTop: 60 },
  title: { fontSize: 24, fontWeight: '600', color: '#111827', marginBottom: 8 },
  subtitle: { fontSize: 14, color: MUTED, marginBottom: 32 },
  group: { marginBottom: 24 },
  categoryHeading: {
    fontSize: 11,
    fontWeight: '500',
    color: MUTED,
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
  cardDescription: { fontSize: 14, color: MUTED },
  lockedDescription: { fontSize: 14, color: MUTED_STRONG },
  lockedReason: { fontSize: 12, color: MUTED_STRONG, marginTop: 6 },
  pressed: { opacity: 0.7 },
  whatYoullNeedLink: { alignSelf: 'flex-start', minHeight: 44, justifyContent: 'center', marginBottom: 24 },
  accountLink: { alignSelf: 'flex-start', minHeight: 44, justifyContent: 'center', marginBottom: 16 },
  accountLinkText: { fontSize: 14, color: ACCENT, fontWeight: '500' },
  whatYoullNeedText: { fontSize: 14, color: ACCENT, fontWeight: '500' },
});
