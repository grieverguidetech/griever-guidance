import { useEffect, useRef, useState } from 'react';
import type { ComponentRef } from 'react';
import { AccessibilityInfo, BackHandler, findNodeHandle, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { isDraftStarted, usePathMoments } from '@griever/hooks';
import type { Session } from '@griever/hooks';
import type { MomentKey, TemplateCategory } from '@griever/shared';
import { doneRowMeta, fill, screenCopy } from '@griever/copy';
import { Hub, PaywallSheet, SentNote } from '@griever/ui';
import type { ButtonNode, HubRow } from '@griever/ui';
import { colors, spacing } from '@griever/tokens';
import { PAYMENTS_ENABLED } from '../lib/features';
import { WhatYoullNeedSheet } from '../components/WhatYoullNeedSheet';
import type { SentNoteText } from '../lib/sendNote';

const copy = screenCopy('pathLanding');
const paywallCopy = screenCopy('paywall');

/** The moments in the full plan. The announcement is free. */
const PAID_MOMENTS: MomentKey[] = ['service', 'thanks'];

/** Where a moment's drafts are kept. */
export const CATEGORY_BY_MOMENT: Record<MomentKey, TemplateCategory> = {
  announce: 'announcement',
  service: 'service',
  obituary: 'obituary',
  thanks: 'aftercare',
};

const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

export type HubScreenProps = {
  session: Session;
  onBack: () => void;
  onStart: (key: MomentKey) => void;
  onEditPerson: () => void;
  /** A calm line after the last person of a send was dealt with. Stays until the person leaves the hub. */
  note?: SentNoteText | null;
  /** Defaults to the build flag; a prop so tests can set it. */
  paymentsEnabled?: boolean;
};

/**
 * The person's plan. The screen itself is the shared Hub in libs/ui, as on
 * web; this holds what is mobile only: the sheets, and reading the person's moments.
 */
export function HubScreen({ session, onBack, onStart, onEditPerson, note, paymentsEnabled = PAYMENTS_ENABLED }: HubScreenProps) {
  const moments = usePathMoments(session);
  const [checklistOpen, setChecklistOpen] = useState(false);
  const [paywallOpen, setPaywallOpen] = useState(false);
  const heading = useRef<ComponentRef<typeof Text>>(null);
  const checklistButton = useRef<ButtonNode>(null);
  // The locked row that opened the placeholder, so screen-reader focus can go back to it.
  const opener = useRef<unknown>(null);
  const sheetOpen = useRef(false);
  sheetOpen.current = checklistOpen || paywallOpen;

  // The heading takes screen-reader focus when the hub opens (after a screen swap).
  useEffect(() => {
    const handle = heading.current ? findNodeHandle(heading.current) : null;
    if (handle) {
      AccessibilityInfo.setAccessibilityFocus(handle);
    }
  }, []);

  // On iOS the note is queued behind the heading focus, so it is read rather than dropped.
  // Android announces after a short wait (below).
  useEffect(() => {
    if (!note) {
      return;
    }
    if (Platform.OS === 'ios') {
      AccessibilityInfo.announceForAccessibilityWithOptions(note.spoken, { queue: true });
      return;
    }
    // Android has no queue, and a live region that mounts with its text may not be spoken while
    // focus moves to the heading. Announce a moment after the focus, as web does.
    const timer = setTimeout(() => AccessibilityInfo.announceForAccessibility(note.spoken), 100);
    return () => clearTimeout(timer);
  }, [note]);

  // Android Back goes Home, as the Back button does. A sheet that is open takes Back first.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (sheetOpen.current) {
        return false;
      }
      onBack();
      return true;
    });
    return () => sub.remove();
  }, [onBack]);

  // The placeholder's onDismiss runs on iOS only, so on Android focus goes back when it is closed
  // (the Close button, or the Back gesture).
  const closePaywall = () => {
    setPaywallOpen(false);
    if (Platform.OS !== 'ios') {
      setTimeout(focusOpener, 0);
    }
  };

  // iOS tells us when the checklist sheet is gone; Android returns to the last focused view by itself.
  const focusChecklistButton = () => {
    const handle = checklistButton.current ? findNodeHandle(checklistButton.current) : null;
    if (handle) {
      AccessibilityInfo.setAccessibilityFocus(handle);
    }
  };

  const focusOpener = () => {
    const handle = opener.current ? findNodeHandle(opener.current as ComponentRef<typeof Text>) : null;
    if (handle) {
      AccessibilityInfo.setAccessibilityFocus(handle);
    }
  };

  const rows: HubRow[] = moments.map((moment) => {
    const started = isDraftStarted(session.drafts[CATEGORY_BY_MOMENT[moment.key]]);
    return {
      key: moment.key,
      status: moment.status,
      started,
      locked: paymentsEnabled && PAID_MOMENTS.includes(moment.key),
      meta:
        moment.status === 'done'
          ? doneRowMeta(copy, {
              recipientCount: moment.recipientCount,
              dateLabel: moment.completedAt ? formatDate(moment.completedAt) : undefined,
              started,
            })
          : undefined,
    };
  });

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Hub
        copy={copy}
        eyebrow={fill(copy.forName, { name: session.personName })}
        rows={rows}
        onBack={onBack}
        onWhatYoullNeed={() => setChecklistOpen(true)}
        onEdit={onEditPerson}
        onStart={onStart}
        onLocked={(row) => {
          opener.current = row;
          setPaywallOpen(true);
        }}
        headingRef={heading}
        checklistRef={checklistButton}
      >
        {note ? (
          <View style={styles.note} accessible accessibilityLiveRegion="polite" accessibilityLabel={`${note.lead} ${note.rest}`}>
            <SentNote lead={note.lead} rest={note.rest} />
          </View>
        ) : null}
      </Hub>
      <WhatYoullNeedSheet visible={checklistOpen} onClose={() => setChecklistOpen(false)} onDismiss={focusChecklistButton} />
      {paymentsEnabled && <PaywallSheet copy={paywallCopy} visible={paywallOpen} onClose={closePaywall} onDismiss={focusOpener} />}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  note: { marginBottom: 16 },
  content: { padding: spacing[3], paddingTop: 64 },
});
