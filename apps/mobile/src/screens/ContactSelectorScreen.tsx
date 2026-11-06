import { useEffect, useRef, useState } from 'react';
import type { ComponentRef, ReactNode } from 'react';
import { AccessibilityInfo, BackHandler, findNodeHandle, FlatList, Linking, Text, View, StyleSheet, KeyboardAvoidingView, Platform } from 'react-native';
import type { UseContactsResult } from '@griever/hooks';
import type { TemplateCategory } from '@griever/shared';
import { Cancelled, detectDeviceRegion, runImport, toE164, type NormalizedContact } from '@griever/contacts';
import { fill, screenCopy } from '@griever/copy';
import { colors, spacing } from '@griever/tokens';
import { Body, Button, Heading, LiveLine, PersonRow, SelectedCount, Sheet, WhoShouldKnow } from '../ui';
import type { ButtonNode } from '../ui';
import { expoContactsSource } from '../lib/expoContactsSource';
import type { FlowProps } from '../app/App';
import { everyoneYouTold, notSentYet } from '../lib/defaultRecipients';
import { ErrorText, Field } from '../components/authForm';
import { useRecheckWhenBlocked } from '../lib/useRecheckWhenBlocked';
import { SavedNote } from '../components/SavedNote';

interface Props extends FlowProps {
  contacts: UseContactsResult;
  /** Who each moment was sent to. Stays on this phone. */
  notified: Partial<Record<TemplateCategory, string[]>>;
  /** The sheet is shown. Default true. The app keeps this mounted and closes it, so iOS can report the dismiss. */
  open?: boolean;
  /** iOS: the sheet has finished closing. */
  onDismiss?: () => void;
}

type Mode = { kind: 'list' } | { kind: 'reviewing'; fresh: NormalizedContact[] };

// The people list's own words (heading, Close, Done) sit over the shared ones, which web also reads.
const copy = { ...screenCopy('whoShouldKnow'), ...screenCopy('phonePeople') };

/**
 * The list is WhoShouldKnow in apps/mobile/src/ui. This holds what is mobile only: Bring people
 * across (import from the phone's contacts) and its review list.
 */
export function ContactSelectorScreen({ flow, contacts, notified, open = true, onDismiss }: Props) {
  const { selectedContactIds, toggleContact, selectContacts, nextStep, templateCategory } = flow;
  const toldIds = templateCategory ? (notified?.[templateCategory] ?? []) : [];
  const shortcuts = buildShortcuts(templateCategory, notified, contacts.contacts.map((c) => c.contactId), selectContacts);
  const [mode, setMode] = useState<Mode>({ kind: 'list' });
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [blocked, setBlocked] = useState(false);
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [reviewQuery, setReviewQuery] = useState('');
  // A second tap while a read or a save is running does nothing.
  const inFlight = useRef(false);
  const importButton = useRef<ButtonNode>(null);
  const reviewHeading = useRef<ComponentRef<typeof Text>>(null);
  const listHeading = useRef<ComponentRef<typeof Text>>(null);
  const wasReviewing = useRef(false);
  const reviewing = mode.kind === 'reviewing';
  const focusNode = (node: unknown) => {
    const handle = node ? findNodeHandle(node as never) : null;
    if (handle) {
      AccessibilityInfo.setAccessibilityFocus(handle);
    }
  };
  // The title takes focus each time the sheet opens. The Modal's onShow does it on a device; this is the fallback.
  useEffect(() => {
    if (open) {
      focusNode(listHeading.current);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  // A safety net: a visible Modal takes Android Back through its onRequestClose (leave), which also steps back to the list.
  // Android Back in the review does what the on-screen Back does: back to the list.
  useEffect(() => {
    if (!reviewing) {
      return undefined;
    }
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      setMode({ kind: 'list' });
      return true;
    });
    return () => sub.remove();
  }, [reviewing]);
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
  // Back from Settings: if contacts can be read (or asked about) now, drop the blocked line and go to the import button.
  useRecheckWhenBlocked(blocked, () => {
    setBlocked(false);
    focusNode(importButton.current);
  });
  const [reviewSelected, setReviewSelected] = useState<Set<string>>(new Set());

  // Close, Done, a tap on the dim area, a swipe down and Android Back all end here: the ticks stay and the
  // sheet closes. While the review of brought-in people is open, they step back to the list instead.
  const leave = () => {
    if (reviewing) {
      setMode({ kind: 'list' });
    } else {
      nextStep();
    }
  };
  const inSheet = (content: ReactNode) => (
    <Sheet bare swipeToClose visible={open} title={copy.heading} closeLabel={copy.close} onClose={leave} onShow={() => focusNode(listHeading.current)} onDismiss={onDismiss}>
      {content}
    </Sheet>
  );

  async function handleImport() {
    if (inFlight.current) {
      return;
    }
    inFlight.current = true;
    setImporting(true);
    setImportError(null);
    // Cleared so the line and Open Settings come back (and are read again) if it is still refused.
    setBlocked(false);
    try {
      const storedPhones = new Set(contacts.contacts.map((c) => c.phone));
      const result = await runImport(expoContactsSource, storedPhones, detectDeviceRegion());
      // Nobody is ticked for the person: they choose.
      setReviewSelected(new Set());
      setReviewQuery('');
      setAddError(null);
      setMode({ kind: 'reviewing', fresh: result.fresh });
    } catch (err) {
      if (err instanceof Cancelled) {
        // Refused for good: say so, and offer Settings. A plain "no" is just nothing chosen.
        setBlocked(err.reason === 'blocked');
      } else {
        setImportError(copy.importError);
      }
    } finally {
      inFlight.current = false;
      setImporting(false);
    }
  }

  async function commitReview() {
    if (mode.kind !== 'reviewing' || inFlight.current) {
      return;
    }
    inFlight.current = true;
    setAdding(true);
    setAddError(null);
    try {
      const picked = mode.fresh
        .filter((c) => reviewSelected.has(c.key))
        .map((c) => ({ name: c.displayName, phone: c.phone, email: c.email, tier: 'family' as const }));
      if (picked.length > 0) {
        const created = await contacts.importContacts(picked, 'native');
        // People brought in here come back ticked.
        selectContacts(created.map((c) => c.contactId));
      }
      setMode({ kind: 'list' });
    } catch {
      setAddError(copy.saveFailed);
    } finally {
      inFlight.current = false;
      setAdding(false);
    }
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
    const needle = reviewQuery.trim().toLowerCase();
    const shownFresh = needle ? mode.fresh.filter((c) => c.displayName.toLowerCase().includes(needle)) : mode.fresh;
    return inSheet(
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <FlatList
        style={styles.flex}
        keyboardDismissMode="on-drag"
        contentContainerStyle={[styles.content, styles.review]}
        keyboardShouldPersistTaps="handled"
        data={shownFresh}
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
            {mode.fresh.length > 0 ? <Field label={copy.searchLabel} value={reviewQuery} onChangeText={setReviewQuery} returnKeyType="search" autoCorrect={false} autoCapitalize="none" /> : null}
            {mode.fresh.length > 0 && shownFresh.length === 0 ? <LiveLine label={copy.searchEmpty} /> : null}
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
      />
      <View style={styles.sticky}>
        <ErrorText message={addError} />
        <View style={styles.footerRow}>
          <View style={styles.countBox}>
            <SelectedCount label={fill(copy.chosen, { count: reviewSelected.size })} />
          </View>
          <Button
            label={copy.add}
            busy={adding}
            busyLabel={copy.saving}
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
      </KeyboardAvoidingView>,
    );
  }

  return inSheet(
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <WhoShouldKnow
        copy={copy}
        headingRef={listHeading}
        people={contacts.contacts.map((c) => ({ id: c.contactId, name: c.name, phone: c.phone, tier: c.tier }))}
        grouped={false}
        search
        scrollList
        guardedAdd
        toldIds={toldIds}
        shortcuts={shortcuts}
        selectedIds={selectedContactIds}
        loading={contacts.loading}
        onToggle={toggleContact}
        onSelectAll={selectContacts}
        toE164={(raw) => toE164(raw, detectDeviceRegion())}
        onAddPerson={async ({ name, phone }) => {
          const created = await contacts.addContact({ name, phone, tier: 'family' });
          toggleContact(created.contactId);
        }}
        onBack={nextStep}
        closeLabel={copy.close}
        doneLabel={selectedContactIds.length > 0 ? fill(copy.doneCount, { count: selectedContactIds.length }) : copy.done}
        onContinue={nextStep}
        allowNone={templateCategory === 'service' || templateCategory === 'obituary'}
        bringAcross={{
          buttonRef: importButton,
          onPress: handleImport,
          busy: importing,
          notice: importError ?? undefined,
          blocked: blocked ? { onOpenSettings: () => void Linking.openSettings() } : undefined,
        }}
        footer={<SavedNote />}
      />
    </KeyboardAvoidingView>,
  );
}

/**
 * The two shortcut buttons for the later moments (copy: everyoneYouTold, notSentYet). They only add ticks, and they
 * skip anyone who is no longer saved.
 */
function buildShortcuts(
  category: TemplateCategory | null,
  notified: Props['notified'],
  savedIds: string[],
  select: (ids: string[]) => void,
) {
  if (!category) {
    return undefined;
  }
  const told = everyoneYouTold(category, notified, savedIds);
  const notSent = notSentYet(category, notified, savedIds);
  const list: { label: string; accessibilityName: string; onPress: () => void }[] = [];
  if (told.length > 0) {
    list.push({ label: copy.everyoneYouTold, accessibilityName: copy.everyoneYouToldSelectAll, onPress: () => select(told) });
  }
  if (notSent.length > 0) {
    list.push({
      label: copy.notSentYet,
      accessibilityName: copy.notSentYetSelectAll,
      onPress: () => select(notSent),
    });
  }
  return list;
}

const Gap = () => <View style={styles.gap} />;

const styles = StyleSheet.create({
  gap: { height: spacing[2] },
  flex: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing[3], paddingTop: spacing[4] },
  review: { gap: spacing[3] },
  topBar: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing[1], justifyContent: 'space-between', alignItems: 'center' },
  head: { gap: spacing[1] },
  sticky: { gap: spacing[1], padding: spacing[3], borderTopWidth: 1, borderTopColor: colors['neutral-300'], backgroundColor: colors.bg },
  footerRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: spacing[2], paddingTop: spacing[1] },
  countBox: { flexShrink: 1 },
});
