import { StyleSheet, View } from 'react-native';
import { useId } from 'react';
import { fill, screenCopy } from '@griever/copy';
import { useMembers } from '@griever/hooks';
import { spacing } from '@griever/tokens';
import { SHARING_ENABLED } from '../lib/features';
import { useSyncAuth } from '../lib/AccountProvider';
import { Heading } from '../ui/Heading';
import { Status } from '../ui/Status';
import { Body } from '../ui/Text';

const copy = screenCopy('phonePeopleHelping');

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

/**
 * The helpers section on Your account. Read only: it lists who helps and who is invited. Nothing
 * is requested unless accounts are on, sharing is on, the person is signed in and the session has
 * not ended. Emails are shown, never picked from contacts (C3, C6).
 */
export function PeopleHelping({ sessionEnded }: { sessionEnded: boolean }) {
  const auth = useSyncAuth();
  if (!SHARING_ENABLED || sessionEnded || !auth || auth.status !== 'signed_in') {
    return null;
  }
  return <PeopleHelpingSection getToken={auth.getToken} />;
}

function PeopleHelpingSection({ getToken }: { getToken: () => Promise<string | null> }) {
  const statusId = useId();
  const { view, status, message } = useMembers({ getAccessToken: getToken, enabled: true });
  const owner = view?.role === 'owner' ? view : null;

  return (
    <View style={styles.group}>
      {view?.role === 'member' ? (
        <Body>{fill(copy.memberLine, { owner: view.owner.name ?? copy.someone })}</Body>
      ) : (
        <>
          <Heading level={2}>{copy.heading}</Heading>
          <Body tone="muted">{copy.intro}</Body>
        </>
      )}
      {!view && status === 'loading' ? <Body tone="muted">{copy.loading}</Body> : null}
      {owner && owner.members.length > 0 ? (
        <View style={styles.list}>
          <Heading level={3}>{copy.helpingHeading}</Heading>
          {owner.members.map((member) => (
            <Body key={member.id}>{member.name ?? member.email}</Body>
          ))}
        </View>
      ) : null}
      {owner && owner.invites.length > 0 ? (
        <View style={styles.list}>
          <Heading level={3}>{copy.invitedHeading}</Heading>
          {owner.invites.map((invite) => (
            <View key={invite.id} style={styles.invite} accessible>
              <Body>{invite.email}</Body>
              <Body tone="muted" small>
                {fill(copy.invitedLine, { date: formatDate(invite.expiresAt) })}
              </Body>
            </View>
          ))}
        </View>
      ) : null}
      <Status id={statusId} message={message ?? undefined} />
    </View>
  );
}

const styles = StyleSheet.create({
  group: { gap: spacing[2], marginTop: spacing[2] },
  list: { gap: spacing[1] },
  invite: { gap: spacing[1] },
});
