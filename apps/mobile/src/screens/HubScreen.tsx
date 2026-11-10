import { useEffect, useRef, useState } from 'react';
import type { ComponentRef } from 'react';
import { AccessibilityInfo, findNodeHandle, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { firstMissingField, isDraftStarted, isObituaryEmailed, MOMENT_CATEGORY, sendCardStatus, usePathMoments } from '@griever/hooks';
import type { Session } from '@griever/hooks';
import { parseCompleteDate } from '@griever/shared';
import type { ChecklistItemId, ChecklistItemState, MomentKey } from '@griever/shared';
import { fill, screenCopy } from '@griever/copy';
import { useSessionWithAccountName } from '../lib/accountName';
import { ActionBar, Button, Hub, PaywallSheet, SentNote } from '../ui';
import type { ButtonNode, HubRow } from '../ui';
import { colors, spacing } from '@griever/tokens';
import { PAYMENTS_ENABLED } from '../lib/features';
import { NameSwitcher } from '../components/NameSwitcher';
import { personLabel } from '../components/PersonSwitcher';
import { PersonChecklistSheet } from '../components/PersonChecklistSheet';
import { NEW_OBITUARY_KEYS } from '../lib/obituaryText';
import type { SentNoteText } from '../lib/sendNote';
import { barMoment, nextMoment } from '../lib/nextMoment';

const copy = screenCopy('pathLanding');
const paywallCopy = screenCopy('paywall');
const phoneCopy = screenCopy('phoneHub');
// Web's Overview wording for the card summaries and the Continue line. Read only: web owns it.
const shell = screenCopy('cmsShell');
// The person screen on the phone has its own heading and line; the rest comes from the shared hub copy.
const hubCopy = { ...copy, heading: phoneCopy.heading, intro: phoneCopy.intro, whatYoullNeed: phoneCopy.whatYoullNeed, whatYoullNeedHint: phoneCopy.whatYoullNeedHint, continue: shell.continue, stateDone: phoneCopy.stateDone, stateInProgress: phoneCopy.stateInProgress, stateNotStarted: phoneCopy.stateNotStarted };

/** The moments in the full plan. The announcement is free. */
const PAID_MOMENTS: MomentKey[] = ['service', 'thanks'];

/** Where a moment's drafts are kept (one map, shared with the hooks). */
export { MOMENT_CATEGORY as CATEGORY_BY_MOMENT } from '@griever/hooks';

const SUMMARY_MAX = 80;

const present = (value: string | null | undefined): string => value?.trim() ?? '';

/** "May 29, 2026" when the date is complete; otherwise whatever was typed. */
function dateLabel(value: string): string {
  const date = parseCompleteDate(value);
  if (!date) {
    return value;
  }
  return date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

function serviceSummary(session: Session): string {
  const type = present(session.serviceType);
  const date = present(session.serviceDate);
  const place = present(session.servicePlace);
  if (!type && !date && !place) {
    return shell.summaryServiceEmpty;
  }
  const head = type || shell.summaryServiceDefaultType;
  const withDate = date ? fill(shell.summaryServiceDate, { type: head, date: dateLabel(date) }) : head;
  return place ? fill(shell.summaryServicePlace, { summary: withDate, place }) : withDate;
}

/** First non-empty line of the message, cut short so a card stays one line. */
function announcementSummary(session: Session): string {
  const line = present(session.announcementMessage)
    .split('\n')
    .map((part) => part.trim())
    .find(Boolean);
  if (!line) {
    return shell.summaryAnnouncementEmpty;
  }
  return line.length > SUMMARY_MAX ? `${line.slice(0, SUMMARY_MAX).trimEnd()}…` : line;
}

function obituarySummary(session: Session): string {
  const publisher = present(session.obituaryPublisher);
  if (publisher) {
    return fill(shell.summaryObituaryPublisher, { publisher });
  }
  const started = [session.obituaryText, session.obituaryCity, session.obituaryCareer, session.obituarySurvivors, session.obituaryNote, ...NEW_OBITUARY_KEYS.map((key) => session[key]), session.obituaryMemorial].some((value) => present(value));
  return started ? shell.summaryObituaryDraft : shell.summaryObituaryEmpty;
}

/** A finished row says what happened, never a prompt to start: who was texted, else that the paper was emailed. */
function doneLine(session: Session, key: MomentKey): string | undefined {
  const sent = session.recipientsNotified?.[MOMENT_CATEGORY[key]]?.length ?? 0;
  if (sent === 1) {
    return phoneCopy.summarySentOne;
  }
  if (sent > 1) {
    return fill(phoneCopy.summarySentMany, { count: String(sent) });
  }
  return key === 'obituary' && isObituaryEmailed(session) ? phoneCopy.summaryEmailed : undefined;
}

/** The muted line under a card's title: web's Overview summary, built from the phone session. */
function summaryLine(session: Session, key: MomentKey, done: boolean): string {
  const finished = done ? doneLine(session, key) : undefined;
  if (finished) {
    return finished;
  }
  switch (key) {
    case 'announce':
      return announcementSummary(session);
    case 'service':
      return serviceSummary(session);
    case 'obituary':
      return obituarySummary(session);
    default:
      return present(session.thanksMessage) ? shell.summaryThanksDraft : shell.summaryThanksEmpty;
  }
}

/** The "Needs ..." line: what is missing. It replaces the summary on its card. */
function metaLine(session: Session, key: MomentKey): string | undefined {
  const status = sendCardStatus(session, key);
  if (status === 'needsDetail') {
    return needsLine(session, key);
  }
  if (status === 'waitingForLink') {
    return fill(copy.statusNeedsField, { field: copy.statusFieldNames.obituaryUrl });
  }
  return undefined;
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

/**
 * Done, in progress or not started. A send stopped part-way is in progress even though people were
 * texted. Otherwise done wins. Not done: a draft was started, or the obituary text waits for its link.
 */
function rowState(statusSession: Session, session: Session, moment: { key: MomentKey; status: string }, stopped: MomentKey | null): HubRow['state'] {
  if (moment.key === stopped) {
    return 'inProgress';
  }
  if (moment.status === 'done') {
    return 'done';
  }
  const started = isDraftStarted(session.drafts[MOMENT_CATEGORY[moment.key]], true, true);
  return started || sendCardStatus(statusSession, moment.key) === 'waitingForLink' ? 'inProgress' : 'notStarted';
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
  onStart: (key: MomentKey) => void;
  /** Saves one checklist item on this person, on this phone. */
  onSetItem: (id: ChecklistItemId, state: ChecklistItemState | null) => void;
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
export function HubScreen({ session, others, onSwitch, onAddSomeone, onAccount, onStart, onSetItem, onEditPerson, note, paymentsEnabled = PAYMENTS_ENABLED }: HubScreenProps) {
  // The account name counts as the sender name for the card status only. It is never saved to the person (DS-7).
  const statusSession = useSessionWithAccountName(session);
  const moments = usePathMoments(statusSession);
  const [checklistOpen, setChecklistOpen] = useState(false);
  const [paywallOpen, setPaywallOpen] = useState(false);
  const heading = useRef<ComponentRef<typeof Text>>(null);
  const checklistButton = useRef<ButtonNode>(null);
  // The Android focus return waits one tick; an unmount before it runs cancels it.
  const focusTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(focusTimer.current), []);
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

  const focusChecklistButton = () => {
    const handle = checklistButton.current ? findNodeHandle(checklistButton.current) : null;
    if (handle) {
      AccessibilityInfo.setAccessibilityFocus(handle);
    }
  };

  // iOS tells us when a sheet is gone (onDismiss); Android does not, so focus goes back when it is closed.
  const closeChecklist = () => {
    setChecklistOpen(false);
    if (Platform.OS !== 'ios') {
      focusTimer.current = setTimeout(focusChecklistButton, 0);
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
  const lit = nextMoment({ session: statusSession, locked, partial: stopped });

  const rows: HubRow[] = moments.map((moment) => {
    const state = rowState(statusSession, session, moment, stopped);
    return {
      key: moment.key,
      status: moment.status,
      state,
      lit: moment.key === lit,
      locked: locked.includes(moment.key),
      summary: summaryLine(statusSession, moment.key, state === 'done'),
      meta: moment.status === 'done' ? undefined : metaLine(statusSession, moment.key),
    };
  });

  // The bottom button names the lit card and does what tapping it does. With none lit it uses `barMoment`: the first open card, else the announcement.
  const target: MomentKey = barMoment({ session: statusSession, locked, partial: stopped });
  const primaryLabel = copy.moments[target].title;

  return (
    <View style={styles.screen}>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
      <Hub
        copy={hubCopy}
        eyebrow={fill(copy.forName, { name: session.personName })}
        rows={rows}
        name={<NameSwitcher name={personLabel(session)} others={others} onPick={onSwitch} onEdit={onEditPerson} onAdd={onAddSomeone} />}
        onWhatYoullNeed={() => setChecklistOpen(true)}
        onStart={onStart}
        onLocked={(row) => {
          opener.current = row;
          setPaywallOpen(true);
        }}
        metaOnAllRows
        headingRef={heading}
        whatYoullNeedRef={checklistButton}
        footer={onAccount ? <Button label={phoneCopy.account} variant="tertiary" onPress={onAccount} /> : undefined}
      >
        {note ? (
          <View style={styles.note} accessible accessibilityLiveRegion="polite" accessibilityLabel={`${note.lead} ${note.rest}`}>
            <SentNote lead={note.lead} rest={note.rest} />
          </View>
        ) : null}
      </Hub>
      </ScrollView>
      <ActionBar testID="hub-action-bar" label={primaryLabel} onPress={() => onStart(target)} />
      <PersonChecklistSheet visible={checklistOpen} onClose={closeChecklist} onDismiss={focusChecklistButton} checklist={session.checklist} onSetItem={onSetItem} />
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
