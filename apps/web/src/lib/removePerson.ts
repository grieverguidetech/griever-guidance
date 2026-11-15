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
 * server cannot be reached (`syncOn` false), a person tied to an account is left out. The server
 * copy stays for helpers and other devices, so removing them here alone would leave it behind.
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

const DELETE_TIMEOUT_MS = 15_000;

export function resultFor(reason: FlowsFailure['reason']): RemoveResult {
  return reason === 'offline' ? 'offline' : 'failed';
}

interface RemoveDeps {
  syncOn: boolean;
  /** The flow id the server knows the person by. */
  flowId: string | undefined;
  getToken: () => Promise<string | null>;
  deleteFlow: (token: string, flowId: string, signal?: AbortSignal) => Promise<{ ok: true } | FlowsFailure>;
  /** Stops a slow request. Defaults to a 15 second timeout. */
  signal?: AbortSignal;
  /** Removes on this device. false means the person was already gone or is not removable. */
  removeLocal: () => boolean;
}

/**
 * Removes one person. Synced: the server first, and the device only after the server says the person
 * is gone (`ok`, or `not_found` because it is already gone). Every other answer leaves the person.
 * Device-only: removed here, nothing is sent.
 */
export async function removePerson(deps: RemoveDeps): Promise<RemoveResult> {
  // Sync off: the person is device-only, so it goes locally with no request.
  if (!deps.syncOn) {
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
  const signal = deps.signal ?? AbortSignal.timeout(DELETE_TIMEOUT_MS);
  const answer = await deps.deleteFlow(token, deps.flowId, signal);
  if (answer.ok || answer.reason === 'not_found') {
    deps.removeLocal();
    return 'removed';
  }
  // A timeout is reported as a failure by the client; to the user it is the same as no connection.
  return signal.aborted ? 'offline' : resultFor(answer.reason);
}
