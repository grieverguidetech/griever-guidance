import { useEffect, useState } from 'react';
import { BackHandler, ScrollView, StyleSheet } from 'react-native';
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

  // Android Back goes Home, as the Back button does. An open sheet takes Back first (its own handler).
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      onBack();
      return true;
    });
    return () => sub.remove();
  }, [onBack]);

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
        onLocked={() => setPaywallOpen(true)}
      />
      <WhatYoullNeedSheet visible={checklistOpen} onClose={() => setChecklistOpen(false)} />
      {paymentsEnabled && <PaywallPlaceholder visible={paywallOpen} onClose={() => setPaywallOpen(false)} />}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing[3], paddingTop: 64 },
});
