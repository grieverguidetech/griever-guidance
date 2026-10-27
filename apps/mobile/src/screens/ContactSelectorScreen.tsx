import { useEffect, useRef, useState } from 'react';
import type { ComponentRef } from 'react';
import { AccessibilityInfo, findNodeHandle, FlatList, Text, View, StyleSheet, ScrollView, KeyboardAvoidingView, Platform } from 'react-native';
import type { UseContactsResult } from '@griever/hooks';
import { Cancelled, detectDeviceRegion, runImport, toE164, type NormalizedContact } from '@griever/contacts';
import { fill, screenCopy } from '@griever/copy';
import { colors, spacing } from '@griever/tokens';
import { Body, Button, Heading, PersonRow, SelectedCount, WhoShouldKnow } from '@griever/ui';
import type { ButtonNode } from '@griever/ui';
import { expoContactsSource } from '../lib/expoContactsSource';
import type { FlowProps } from '../app/App';
import { SavedNote } from '../components/SavedNote';
import { WhatYoullNeedSheet } from '../components/WhatYoullNeedSheet';

interface Props extends FlowProps {
  contacts: UseContactsResult;
}

type Mode = { kind: 'list' } | { kind: 'reviewing'; fresh: NormalizedContact[] };

const copy = screenCopy('whoShouldKnow');

/**
 * The list is the shared WhoShouldKnow in libs/ui. This holds what is mobile only: Bring people
 * across (import from the phone's contacts) and its review list.
 */
export function ContactSelectorScreen({ flow, contacts }: Props) {
  const { selectedContactIds, toggleContact, selectContacts, nextStep, prevStep, templateCategory } = flow;
  const [mode, setMode] = useState<Mode>({ kind: 'list' });
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [checklistOpen, setChecklistOpen] = useState(false);
  const checklistButton = useRef<ButtonNode>(null);
  // iOS tells us when the sheet is gone; Android returns to the last focused view by itself.
  const focusChecklistButton = () => {
    const handle = checklistButton.current ? findNodeHandle(checklistButton.current) : null;
    if (handle) {
      AccessibilityInfo.setAccessibilityFocus(handle);
    }
  };
  const importButton = useRef<ButtonNode>(null);
  const reviewHeading = useRef<ComponentRef<typeof Text>>(null);
  const wasReviewing = useRef(false);
  const reviewing = mode.kind === 'reviewing';
  const focusNode = (node: unknown) => {
    const handle = node ? findNodeHandle(node as never) : null;
    if (handle) {
      AccessibilityInfo.setAccessibilityFocus(handle);
    }
  };
  // Focus follows the view: the review heading on the way in, the import button on the way back.
  useEffect(() => {
    if (reviewing) {
      wasReviewing.current = true;
      focusNode(reviewHeading.current);
    } else if (wasReviewing.current) {
      wasReviewing.current = false;
      focusNode(importButton.current);
    }
  }, [reviewing]);
  const [reviewSelected, setReviewSelected] = useState<Set<string>>(new Set());

  // Same rule as web: group only for announcements, and only when both groups have people.
  const tiers = new Set(contacts.contacts.map((c) => c.tier ?? 'family'));
  const grouped = templateCategory === 'announcement' && tiers.size > 1;

  async function handleImport() {
    setImporting(true);
    setImportError(null);
    try {
      const storedPhones = new Set(contacts.contacts.map((c) => c.phone));
      const result = await runImport(expoContactsSource, storedPhones, detectDeviceRegion());
      setReviewSelected(new Set(result.fresh.filter((c) => c.starred).map((c) => c.key)));
      setMode({ kind: 'reviewing', fresh: result.fresh });
    } catch (err) {
      if (!(err instanceof Cancelled)) {
        setImportError(copy.importError);
      }
    } finally {
      setImporting(false);
    }
  }

  async function commitReview() {
    if (mode.kind !== 'reviewing') {
      return;
    }
    const picked = mode.fresh
      .filter((c) => reviewSelected.has(c.key))
      .map((c) => ({ name: c.displayName, phone: c.phone, email: c.email, tier: 'family' as const }));
    if (picked.length > 0) {
      await contacts.importContacts(picked, 'native');
    }
    setMode({ kind: 'list' });
  }

  if (mode.kind === 'reviewing') {
    const none = reviewSelected.size === 0;
    const toggleReview = (key: string) =>
      setReviewSelected((current) => {
        const next = new Set(current);
        if (next.has(key)) {
          next.delete(key);
        } else {
          next.add(key);
        }
        return next;
      });
    return (
      <FlatList
        style={styles.flex}
        contentContainerStyle={[styles.content, styles.review]}
        data={mode.fresh}
        keyExtractor={(item) => item.key}
        ListHeaderComponent={
          <View style={styles.review}>
            <View style={styles.topBar}>
              <Button label={copy.back} variant="header" onPress={() => setMode({ kind: 'list' })} />
            </View>
            <View style={styles.head}>
              <Heading level={1} headingRef={reviewHeading}>
                {copy.bringAcross}
              </Heading>
              <Body tone="muted">{copy.importIntro}</Body>
            </View>
            {mode.fresh.length === 0 ? <Body tone="muted">{copy.importEmpty}</Body> : null}
          </View>
        }
        renderItem={({ item }) => (
          <PersonRow
            person={{ id: item.key, name: item.displayName, phone: item.phone }}
            selected={reviewSelected.has(item.key)}
            onToggle={() => toggleReview(item.key)}
          />
        )}
        ItemSeparatorComponent={Gap}
        ListFooterComponent={
          <View style={styles.review}>
            <View style={styles.footerRow}>
              <SelectedCount label={fill(copy.chosen, { count: reviewSelected.size })} />
              <Button
                label={copy.add}
                ariaDisabled={none}
                announceDisabled
                hint={none ? copy.chooseOne : undefined}
                onPress={() => {
                  if (!none) {
                    void commitReview();
                  }
                }}
              />
            </View>
            {none ? (
              <Body small tone="muted" hidden>
                {copy.chooseOne}
              </Body>
            ) : null}
          </View>
        }
      />
    );
  }

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView style={styles.flex} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <WhoShouldKnow
          copy={copy}
          people={contacts.contacts.map((c) => ({ id: c.contactId, name: c.name, phone: c.phone, tier: c.tier }))}
          grouped={grouped}
          selectedIds={selectedContactIds}
          selectedLabel={fill(copy.selected, { count: selectedContactIds.length })}
          loading={contacts.loading}
          onToggle={toggleContact}
          onSelectAll={selectContacts}
          toE164={(raw) => toE164(raw, detectDeviceRegion())}
          onAddPerson={async ({ name, phone }) => {
            const created = await contacts.addContact({ name, phone, tier: 'family' });
            toggleContact(created.contactId);
          }}
          onBack={prevStep}
          onWhatYoullNeed={() => setChecklistOpen(true)}
          checklistRef={checklistButton}
          onContinue={nextStep}
          bringAcross={{ buttonRef: importButton, onPress: handleImport, busy: importing, notice: importError ?? undefined }}
          footer={<SavedNote />}
        />
      </ScrollView>
      <WhatYoullNeedSheet visible={checklistOpen} onClose={() => setChecklistOpen(false)} onDismiss={focusChecklistButton} />
    </KeyboardAvoidingView>
  );
}

const Gap = () => <View style={styles.gap} />;

const styles = StyleSheet.create({
  gap: { height: spacing[2] },
  flex: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing[3], paddingTop: spacing[4] },
  review: { gap: spacing[3] },
  topBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  head: { gap: spacing[1] },
  footerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: spacing[1] },
});
