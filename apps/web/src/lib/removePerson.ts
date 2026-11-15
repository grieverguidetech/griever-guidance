import type { FlowsFailure } from '@griever/api-client';
import type { Session } from '@griever/hooks';

/** What the Remove a person panel shows for the result. */
export type RemoveResult = 'removed' | 'offline' | 'failed';

type Removable = Pick<Session, 'id' | 'personName' | 'ownerId' | 'heldFor' | 'role'>;

/** A person tied to an account (synced, or made while someone was signed in) lives on the server too. */
export function isAccountTied(session: Pick<Session, 'ownerId' | 'heldFor'>): boolean {
  return session.ownerId !== null || Boolean(session.heldFor);
}

/**
 * The people the panel offers: owned ones only, never a person someone shared with you. When the
 * server cannot be reached (`syncOn` false), a person tied to an account is left out, because
 * removing them here alone would bring them back on the next pull.
 */
export function removablePeople(
  sessions: readonly Removable[],
  syncOn: boolean,
): { id: string; name: string }[] {
  return sessions
    .filter((s) => s.role === 'owner' && (syncOn || !isAccountTied(s)))
    .map((s) => ({ id: s.id, name: s.personName }));
}

/** True when the account is unreachable and some owned people are hidden for that reason. */
export function hasHiddenAccountPeople(sessions: readonly Removable[], syncOn: boolean): boolean {
  return !syncOn && sessions.some((s) => s.role === 'owner' && isAccountTied(s));
}

/** Sync on: the server goes first. Sync off: the person is device-only and goes locally with no request. */
export function needsServer(syncOn: boolean): boolean {
  return syncOn;
}

export function resultFor(reason: FlowsFailure['reason']): RemoveResult {
  return reason === 'offline' ? 'offline' : 'failed';
}

interface RemoveDeps {
  syncOn: boolean;
  /** The flow id the server knows the person by. */
  flowId: string | undefined;
  getToken: () => Promise<string | null>;
  deleteFlow: (token: string, flowId: string) => Promise<{ ok: true } | FlowsFailure>;
  /** Removes on this device. false means the person was already gone or is not removable. */
  removeLocal: () => boolean;
}

/**
 * Removes one person. Synced: the server first, and the device only after the server says the person
 * is gone (`ok`, or `not_found` because it is already gone). Every other answer leaves the person.
 * Device-only: removed here, nothing is sent.
 */
export async function removePerson(deps: RemoveDeps): Promise<RemoveResult> {
  if (!needsServer(deps.syncOn)) {
    deps.removeLocal();
    return 'removed';
  }
  if (!deps.flowId) {
    return 'failed';
  }
  let token: string | null;
  try {
    token = await deps.getToken();
  } catch {
    return 'failed';
  }
  if (!token) {
    return 'failed';
  }
  const answer = await deps.deleteFlow(token, deps.flowId);
  if (answer.ok || answer.reason === 'not_found') {
    deps.removeLocal();
    return 'removed';
  }
  return resultFor(answer.reason);
}
