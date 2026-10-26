import { useEffect, useRef, useState } from 'react';
import type { ComponentRef } from 'react';
import { AccessibilityInfo, BackHandler, findNodeHandle, ScrollView, StyleSheet, Text } from 'react-native';
import { isDraftStarted, usePathMoments } from '@griever/hooks';
import type { Session } from '@griever/hooks';
import type { MomentKey, TemplateCategory } from '@griever/shared';
import { doneRowMeta, fill, screenCopy } from '@griever/copy';
import { Hub } from '@griever/ui';
import type { HubRow } from '@griever/ui';
import { colors, spacing } from '@griever/tokens';
import { PAYMENTS_ENABLED } from '../lib/features';
import { WhatYoullNeedSheet } from '../components/WhatYoullNeedSheet';
import { PaywallPlaceholder } from './PaywallPlaceholder';

const copy = screenCopy('pathLanding');

/** The moments in the full plan. The announcement is free. */
const PAID_MOMENTS: MomentKey[] = ['service', 'thanks'];

/**
 * Steps this app cannot do yet. Mobile has no step for the obituary link (C10), so the hub lists
 * the obituary with a calm reason instead of sending someone to contacts with no link.
 */
const NOT_IN_APP_YET: MomentKey[] = ['obituary'];

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
  /** Defaults to the build flag; a prop so tests can set it. */
  paymentsEnabled?: boolean;
};

/**
 * The person's plan. The screen itself is the shared Hub in libs/ui, as on
 * web; this holds what is mobile only: the sheets, and reading the person's moments.
 */
export function HubScreen({ session, onBack, onStart, onEditPerson, paymentsEnabled = PAYMENTS_ENABLED }: HubScreenProps) {
  const moments = usePathMoments(session);
  const [checklistOpen, setChecklistOpen] = useState(false);
  const [paywallOpen, setPaywallOpen] = useState(false);
  const heading = useRef<ComponentRef<typeof Text>>(null);
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
      unavailable: NOT_IN_APP_YET.includes(moment.key),
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
      />
      <WhatYoullNeedSheet visible={checklistOpen} onClose={() => setChecklistOpen(false)} />
      {paymentsEnabled && <PaywallPlaceholder visible={paywallOpen} onClose={() => setPaywallOpen(false)} onDismiss={focusOpener} />}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing[3], paddingTop: 64 },
});
