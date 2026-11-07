import { useEffect, useRef, useState } from 'react';
import type { ComponentRef } from 'react';
import { AccessibilityInfo, findNodeHandle, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { firstMissingField, isDraftStarted, MOMENT_CATEGORY, sendCardStatus, usePathMoments } from '@griever/hooks';
import type { Session, SendCardStatus } from '@griever/hooks';
import type { MomentKey } from '@griever/shared';
import { fill, screenCopy } from '@griever/copy';
import { ActionBar, Button, Hub, PaywallSheet, SentNote, Sheet } from '../ui';
import type { ButtonNode, HubRow } from '../ui';
import { colors, spacing } from '@griever/tokens';
import { PAYMENTS_ENABLED } from '../lib/features';
import { NameSwitcher } from '../components/NameSwitcher';
import { personLabel } from '../components/PersonSwitcher';
import { WhatYoullNeedSheet } from '../components/WhatYoullNeedSheet';
import type { SentNoteText } from '../lib/sendNote';
import { barMoment, nextMoment } from '../lib/nextMoment';

const copy = screenCopy('pathLanding');
const paywallCopy = screenCopy('paywall');
const phoneCopy = screenCopy('phoneHub');
const switcherCopy = screenCopy('phoneSwitcher');
// The person screen on the phone has its own heading and line; the rest comes from the shared hub copy.
const hubCopy = { ...copy, heading: phoneCopy.heading, intro: phoneCopy.intro, more: phoneCopy.more, moreHint: phoneCopy.moreHint };

/** The moments in the full plan. The announcement is free. */
const PAID_MOMENTS: MomentKey[] = ['service', 'thanks'];

/** Where a moment's drafts are kept (one map, shared with the hooks). */
export { MOMENT_CATEGORY as CATEGORY_BY_MOMENT } from '@griever/hooks';

/** The status line for a card, from the copy file. */
function statusLine(status: SendCardStatus, session: Session, key: MomentKey): string {
  if (status === 'ready') {
    return copy.statusReady;
  }
  if (status === 'needsDetail') {
    return needsLine(session, key);
  }
  if (status === 'waitingForLink') {
    return copy.statusWaitingForLink;
  }
  return fill(copy.statusSent, { n: status.sent, noun: status.sent === 1 ? copy.person : copy.people });
}

/** "Needs the service date": names the first missing required field. Falls back to the plain line. */
function needsLine(session: Session, key: MomentKey): string {
  const field = firstMissingField(session, key);
  const name = field ? (copy.statusFieldNames as Record<string, string>)[field.key] : undefined;
  if (!name) {
    return copy.statusNeedsDetail;
  }
  return fill(copy.statusNeedsField, { field: name });
}

/** The sent line of a finished card. A send stopped part-way adds what is left to do. */
function sentLine(session: Session, key: MomentKey, stopped: boolean): string {
  const status = sendCardStatus(session, key);
  if (stopped && typeof status === 'object') {
    return fill(phoneCopy.sentPartial, { n: status.sent, noun: status.sent === 1 ? copy.person : copy.people });
  }
  return statusLine(status, session, key);
}

const momentOfCategory = (category: SentNoteText['category']): MomentKey | null =>
  (Object.keys(MOMENT_CATEGORY) as MomentKey[]).find((key) => MOMENT_CATEGORY[key] === category) ?? null;

export type HubScreenProps = {
  session: Session;
  /** The other people kept on this phone. With none, the name is plain text. */
  others: Session[];
  onSwitch: (id: string) => void;
  /** Absent when the user cannot add a person (C11): the add button is then not drawn anywhere. */
  onAddSomeone?: () => void;
  /** Only given when accounts are on. */
  onAccount?: () => void;
  onImportContacts?: () => void;
  onStart: (key: MomentKey) => void;
  onEditPerson: () => void;
  /** A calm line after the last person of a send was dealt with. Stays until the person leaves the hub. */
  note?: SentNoteText | null;
  /** Defaults to the build flag; a prop so tests can set it. */
  paymentsEnabled?: boolean;
};

/**
 * The person's plan. The screen itself is the Hub in
 * apps/mobile/src/ui; this holds what is mobile only: the sheets, and reading the person's moments.
 */
export function HubScreen({ session, others, onSwitch, onAddSomeone, onAccount, onImportContacts, onStart, onEditPerson, note, paymentsEnabled = PAYMENTS_ENABLED }: HubScreenProps) {
  const moments = usePathMoments(session);
  const [moreOpen, setMoreOpen] = useState(false);
  const [checklistOpen, setChecklistOpen] = useState(false);
  const [paywallOpen, setPaywallOpen] = useState(false);
  const heading = useRef<ComponentRef<typeof Text>>(null);
  const moreButton = useRef<ButtonNode>(null);
  // What a More item asked for, run once the More sheet is gone (two sheets must not swap at once).
  const afterMore = useRef<(() => void) | null>(null);
  // The locked row that opened the placeholder, so screen-reader focus can go back to it.
  const opener = useRef<unknown>(null);

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

  // Android Back: an open sheet closes through its own onRequestClose. With none open there is no
  // listener here, so Back leaves the app (there is no Home to go to).

  // The placeholder's onDismiss runs on iOS only, so on Android focus goes back when it is closed
  // (the Close button, or the Back gesture).
  const closePaywall = () => {
    setPaywallOpen(false);
    if (Platform.OS !== 'ios') {
      setTimeout(focusOpener, 0);
    }
  };

  const focusMoreButton = () => {
    const handle = moreButton.current ? findNodeHandle(moreButton.current) : null;
    if (handle) {
      AccessibilityInfo.setAccessibilityFocus(handle);
    }
  };

  // iOS tells us when a sheet is gone (onDismiss); Android does not, so focus goes back when it is closed.
  const closeChecklist = () => {
    setChecklistOpen(false);
    if (Platform.OS !== 'ios') {
      setTimeout(focusMoreButton, 0);
    }
  };

  // The More sheet is gone: run the item that was chosen, or put focus back on More if none was.
  const finishMore = () => {
    const next = afterMore.current;
    afterMore.current = null;
    if (next) {
      next();
      return;
    }
    focusMoreButton();
  };

  const closeMore = (next?: () => void) => {
    // A second close while the sheet slides out (Close, backdrop) must not clear the item already chosen.
    if (next) {
      afterMore.current = next;
    }
    setMoreOpen(false);
    if (Platform.OS !== 'ios') {
      setTimeout(finishMore, 0);
    }
  };

  const focusOpener = () => {
    const handle = opener.current ? findNodeHandle(opener.current as ComponentRef<typeof Text>) : null;
    if (handle) {
      AccessibilityInfo.setAccessibilityFocus(handle);
    }
  };

  const locked = paymentsEnabled ? PAID_MOMENTS : [];
  // "Stop for now" leaves the note; its card stays lit until the person leaves this screen.
  const stopped = note?.partial ? momentOfCategory(note.category) : null;
  const lit = nextMoment({ session, locked, partial: stopped });

  const rows: HubRow[] = moments.map((moment) => ({
    key: moment.key,
    status: moment.status,
    started: isDraftStarted(session.drafts[MOMENT_CATEGORY[moment.key]], true, true),
    lit: moment.key === lit,
    locked: locked.includes(moment.key),
    meta:
      moment.status === 'done'
        ? sentLine(session, moment.key, moment.key === stopped)
        : statusLine(sendCardStatus(session, moment.key), session, moment.key),
  }));

  // The bottom button names the lit card and does what tapping it does. With none lit it uses `barMoment`: the first open card, else the announcement.
  const target: MomentKey = barMoment({ session, locked, partial: stopped });
  const primaryLabel = copy.moments[target].title;

  return (
    <View style={styles.screen}>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
      <Hub
        copy={hubCopy}
        eyebrow={fill(copy.forName, { name: session.personName })}
        rows={rows}
        name={<NameSwitcher name={personLabel(session)} others={others} onPick={onSwitch} onEdit={onEditPerson} onAdd={onAddSomeone} />}
        onMore={() => setMoreOpen(true)}
        onStart={onStart}
        onLocked={(row) => {
          opener.current = row;
          setPaywallOpen(true);
        }}
        metaOnAllRows
        headingRef={heading}
        moreRef={moreButton}
      >
        {note ? (
          <View style={styles.note} accessible accessibilityLiveRegion="polite" accessibilityLabel={`${note.lead} ${note.rest}`}>
            <SentNote lead={note.lead} rest={note.rest} />
          </View>
        ) : null}
      </Hub>
      </ScrollView>
      <ActionBar testID="hub-action-bar" label={primaryLabel} onPress={() => onStart(target)} />
      <Sheet title={phoneCopy.more} closeLabel={phoneCopy.close} visible={moreOpen} onClose={() => closeMore()} onDismiss={finishMore}>
        <Button label={copy.checklist} variant="secondary" onPress={() => closeMore(() => setChecklistOpen(true))} />
        <Button label={copy.editPerson} variant="secondary" onPress={() => closeMore(onEditPerson)} />
        {onAddSomeone && others.length === 0 ? <Button label={switcherCopy.addSomeone} variant="secondary" onPress={() => closeMore(onAddSomeone)} /> : null}
        {onAccount ? <Button label={phoneCopy.account} variant="secondary" onPress={() => closeMore(onAccount)} /> : null}
        {onImportContacts ? <Button label={phoneCopy.importContacts} variant="secondary" onPress={() => closeMore(onImportContacts)} /> : null}
      </Sheet>
      <WhatYoullNeedSheet visible={checklistOpen} onClose={closeChecklist} onDismiss={focusMoreButton} />
      {paymentsEnabled && <PaywallSheet copy={paywallCopy} visible={paywallOpen} onClose={closePaywall} onDismiss={focusOpener} />}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  // Takes the room the bar leaves, and scrolls: at the largest text size every card is still reachable.
  scroll: { flex: 1 },
  note: { marginBottom: 16 },
  content: { padding: spacing[3], paddingTop: spacing[4] },
});
