import type { Text, TextInput } from 'react-native';
import { AccessibilityInfo, StyleSheet, View } from 'react-native';
import { useEffect, useId, useRef, useState } from 'react';
import type { ComponentRef } from 'react';
import { fill, screenCopy } from '@griever/copy';
import { useMembers } from '@griever/hooks';
import type { LeaveOutcome } from '@griever/hooks';
import { parseInviteEmail } from '@griever/shared';
import { spacing } from '@griever/tokens';
import { SHARING_ENABLED } from '../lib/features';
import { useSyncAuth } from '../lib/AccountProvider';
import { announceLeftFamily } from '../lib/leftFamily';
import { Button } from '../ui/Button';
import { focusNode } from '../ui/focusNode';
import { Heading } from '../ui/Heading';
import { Status } from '../ui/Status';
import { Body } from '../ui/Text';
import { LabelledInput } from './AddressFields';
import { LeaveFamilyPanel } from './LeaveFamilyPanel';
import { RemoveMemberPanel } from './RemoveMemberPanel';

const copy = screenCopy('phonePeopleHelping');

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

/**
 * The helpers section on Your account. It lists who helps and who is invited, and lets the owner
 * invite a helper by a typed email or cancel an invitation. Nothing is requested unless accounts are
 * on, sharing is on, the person is signed in and the session has not ended. Emails are typed or
 * shown, never picked from contacts (C3, C6).
 */
export function PeopleHelping({ sessionEnded, reloadProfile }: { sessionEnded: boolean; reloadProfile?: () => void }) {
  const auth = useSyncAuth();
  if (!SHARING_ENABLED || sessionEnded || !auth || auth.status !== 'signed_in') {
    return null;
  }
  return <PeopleHelpingSection key={auth.userId ?? ''} userId={auth.userId ?? ''} getToken={auth.getToken} reloadProfile={reloadProfile} />;
}

function PeopleHelpingSection({
  userId,
  getToken,
  reloadProfile,
}: {
  userId: string;
  getToken: () => Promise<string | null>;
  reloadProfile?: () => void;
}) {
  const statusId = useId();
  const { view, status, message, invite, revoke, remove, leave } = useMembers({ getAccessToken: getToken, enabled: true });
  const owner = view?.role === 'owner' ? view : null;
  const [email, setEmail] = useState('');
  const [emailError, setEmailError] = useState<string | undefined>();
  const [sending, setSending] = useState(false);
  // What this section says itself (sent, cancelled). A failure shows the hook's own message.
  const [notice, setNotice] = useState<string | null>(null);
  const [cancelCount, setCancelCount] = useState(0);
  const [removeCount, setRemoveCount] = useState(0);
  // The one row whose confirm step is open, as on web.
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  // Removed helpers stay hidden until a fresh list arrives, even if the reload after the removal failed.
  const [removedIds, setRemovedIds] = useState<string[]>([]);
  const visibleMembers = owner ? owner.members.filter((member) => !removedIds.includes(member.id)) : [];
  const [cancellingIds, setCancellingIds] = useState<string[]>([]);
  // True from a leave that worked until the owner's view arrives; then focus moves and the line is said.
  const [leftPending, setLeftPending] = useState(false);
  const leftSaid = useRef(false);
  // The owner's name, kept after the view turns owner for the line said once the leave worked.
  const ownerName = useRef('');
  if (view?.role === 'member') {
    ownerName.current = view.owner.name ?? copy.someone;
  }
  // The leave's own failure line: offline says so in our words instead of the hook's.
  const [leaveOffline, setLeaveOffline] = useState(false);
  const sendingRef = useRef(false);
  const cancelling = useRef(new Set<string>());
  const emailInput = useRef<ComponentRef<typeof TextInput> | null>(null);
  const sectionHeading = useRef<ComponentRef<typeof Text> | null>(null);
  const helpingHeading = useRef<ComponentRef<typeof Text> | null>(null);
  const invitedHeading = useRef<ComponentRef<typeof Text> | null>(null);

  // After a cancel the list has reloaded: focus goes to the invited list heading, or to the section heading when none are left.
  useEffect(() => {
    if (cancelCount === 0) {
      return;
    }
    const timer = setTimeout(() => focusNode(invitedHeading.current ?? sectionHeading.current), 0);
    return () => clearTimeout(timer);
  }, [cancelCount]);

  // A fresh list replaces the hidden-row bookkeeping.
  useEffect(() => {
    setRemovedIds([]);
  }, [view]);

  // After a removal focus goes to the helpers list heading, or to the section heading when no one is left.
  const membersLeft = visibleMembers.length;
  useEffect(() => {
    if (removeCount === 0) {
      return;
    }
    const timer = setTimeout(() => focusNode(membersLeft > 0 ? helpingHeading.current : sectionHeading.current), 0);
    return () => clearTimeout(timer);
    // Only when a removal finishes, not when the list changes later.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [removeCount]);

  // Once the owner's view is there the member block is gone: focus the section heading and say it worked.
  const isOwner = owner !== null;
  useEffect(() => {
    if (!leftPending || !isOwner || leftSaid.current) {
      return;
    }
    // A ref, not state: changing state here would run this effect's cleanup and cancel the focus timer.
    leftSaid.current = true;
    setNotice(fill(copy.left, { owner: ownerName.current }));
    const timer = setTimeout(() => focusNode(sectionHeading.current), 0);
    return () => clearTimeout(timer);
  }, [leftPending, isOwner]);

  async function leaveFamily(): Promise<LeaveOutcome> {
    setNotice(null);
    setLeaveOffline(false);
    leftSaid.current = false;
    setLeftPending(false);
    const outcome = await leave();
    if (outcome === 'ok' || outcome === 'not_a_member') {
      setLeftPending(true);
      // The shared people go from the device first; then a pull is asked for and the profile reloaded (role decides C11).
      announceLeftFamily(userId);
      reloadProfile?.();
    } else if (outcome === 'offline') {
      setLeaveOffline(true);
    }
    return outcome;
  }

  async function send() {
    if (sendingRef.current) {
      return;
    }
    setNotice(null);
    if (parseInviteEmail(email) === null) {
      setEmailError(copy.emailInvalid);
      // The field's own line is a live region, which iOS ignores, so it is also announced here.
      AccessibilityInfo.announceForAccessibility(copy.emailInvalid);
      emailInput.current?.focus();
      focusNode(emailInput.current as unknown as ComponentRef<typeof Text> | null);
      return;
    }
    setEmailError(undefined);
    sendingRef.current = true;
    setSending(true);
    const ok = await invite(email);
    sendingRef.current = false;
    setSending(false);
    if (ok) {
      setEmail('');
      setNotice(copy.sent);
    }
  }

  async function cancel(inviteId: string) {
    if (cancelling.current.has(inviteId)) {
      return;
    }
    cancelling.current.add(inviteId);
    setCancellingIds([...cancelling.current]);
    setNotice(null);
    const ok = await revoke(inviteId);
    cancelling.current.delete(inviteId);
    setCancellingIds([...cancelling.current]);
    if (ok) {
      setNotice(copy.cancelled);
      setCancelCount((count) => count + 1);
    }
  }

  async function removeMember(member: { id: string; name: string | null; email: string }): Promise<boolean> {
    setNotice(null);
    const ok = await remove(member.id);
    if (ok) {
      setRemovedIds((ids) => [...ids, member.id]);
      setNotice(fill(copy.removed, { name: member.name ?? member.email }));
      setRemoveCount((count) => count + 1);
    }
    return ok;
  }

  // Both lines show: a sent or cancelled notice and a failed reload can be true together.
  const statusLine = (leaveOffline ? copy.leaveOffline : [notice, message].filter(Boolean).join(' ')) || undefined;

  return (
    <View style={styles.group}>
      {view?.role === 'member' ? <Body>{fill(copy.memberLine, { owner: view.owner.name ?? copy.someone })}</Body> : null}
      {view?.role === 'member' ? (
        <LeaveFamilyPanel
          copy={{
            openLabel: fill(copy.leaveButton, { owner: ownerName.current }),
            heading: fill(copy.leaveHeading, { owner: ownerName.current }),
            body: fill(copy.leaveConfirm, { owner: ownerName.current }),
            action: copy.leaveAction,
            keep: copy.leaveKeep,
            leaving: copy.leaving,
          }}
          onLeave={leaveFamily}
        />
      ) : null}
      {owner ? (
        <>
          <Heading level={2} headingRef={sectionHeading}>
            {copy.heading}
          </Heading>
          <Body tone="muted">{copy.intro}</Body>
          <LabelledInput
            label={copy.emailLabel}
            accessibleName={copy.emailLabel}
            value={email}
            onChangeText={(text) => {
              setEmail(text);
              setEmailError(undefined);
            }}
            editable={!sending}
            inputRef={(node) => {
              emailInput.current = node;
            }}
            error={emailError}
            returnKeyType="send"
            onSubmitEditing={() => void send()}
            literal
            autoCapitalize="none"
            autoComplete="off"
            keyboardType="email-address"
            textContentType="none"
          />
          <Button label={copy.sendButton} busy={sending} busyLabel={copy.sending} onPress={() => void send()} />
        </>
      ) : null}
      {!view && status === 'loading' ? <Body tone="muted">{copy.loading}</Body> : null}
      {owner && visibleMembers.length > 0 ? (
        <View style={styles.list}>
          <Heading level={3} headingRef={helpingHeading}>
            {copy.helpingHeading}
          </Heading>
          <View style={styles.list} role="list">
            {visibleMembers.map((member) => {
              const name = member.name ?? member.email;
              return (
                <View key={member.id} style={styles.invite} role="listitem">
                  <Body>{name}</Body>
                  <RemoveMemberPanel
                    copy={{
                      openLabel: fill(copy.removeButton, { name }),
                      confirmBody: fill(copy.removeConfirm, { name }),
                      confirmAction: copy.removeAction,
                      confirmName: fill(copy.removeButton, { name }),
                      keep: copy.removeKeep,
                      keepName: fill(copy.removeKeepLabel, { name }),
                      removing: copy.removing,
                    }}
                    open={confirmingId === member.id}
                    onOpen={() => setConfirmingId(member.id)}
                    onClose={() => setConfirmingId((id) => (id === member.id ? null : id))}
                    onRemove={() => removeMember(member)}
                  />
                </View>
              );
            })}
          </View>
        </View>
      ) : null}
      {owner && owner.invites.length > 0 ? (
        <View style={styles.list}>
          <Heading level={3} headingRef={invitedHeading}>
            {copy.invitedHeading}
          </Heading>
          <View style={styles.list} role="list">
            {owner.invites.map((invite) => {
              const line = fill(copy.invitedLine, { date: formatDate(invite.expiresAt) });
              return (
                <View key={invite.id} style={styles.invite} role="listitem">
                  <View style={styles.invite} accessible accessibilityLabel={`${invite.email}, ${line}`}>
                    <Body>{invite.email}</Body>
                    <Body tone="muted" small>
                      {line}
                    </Body>
                  </View>
                  <Button
                    label={copy.cancelButton}
                    accessibilityName={fill(copy.cancelLabel, { email: invite.email })}
                    variant="tertiary"
                    busy={cancellingIds.includes(invite.id)}
                    busyLabel={copy.cancelling}
                    onPress={() => void cancel(invite.id)}
                  />
                </View>
              );
            })}
          </View>
        </View>
      ) : null}
      <Status id={statusId} message={statusLine} queue />
    </View>
  );
}

const styles = StyleSheet.create({
  group: { gap: spacing[2], marginTop: spacing[2] },
  list: { gap: spacing[1] },
  invite: { gap: spacing[1] },
});
