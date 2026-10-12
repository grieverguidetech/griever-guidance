import { useCallback, useEffect, useRef, useState } from 'react';
import {
  acceptInvite,
  createInvite,
  getMembers,
  removeMember,
  revokeInvite,
} from '@griever/api-client';
import type {
  AcceptInviteResult,
  CreateInviteResult,
  GetMembersResult,
  MembersFailure,
  MembersFailureReason,
  RemoveMemberResult,
  RevokeInviteResult,
} from '@griever/api-client';
import { parseInviteEmail } from '@griever/shared';
import type { MembersView } from '@griever/shared';

export type MembersStatus = 'idle' | 'loading' | 'ready' | 'offline' | 'unavailable' | 'signed_out';

/** The api-client functions the hook uses. Tests pass a stub; the default is the real module. */
export interface MembersClient {
  getMembers: (accessToken: string) => Promise<GetMembersResult>;
  createInvite: (accessToken: string, email: string) => Promise<CreateInviteResult>;
  revokeInvite: (accessToken: string, inviteId: string) => Promise<RevokeInviteResult>;
  removeMember: (accessToken: string, memberId: string) => Promise<RemoveMemberResult>;
  acceptInvite: (accessToken: string, inviteToken: string) => Promise<AcceptInviteResult>;
}

const defaultClient: MembersClient = { getMembers, createInvite, revokeInvite, removeMember, acceptInvite };

export interface UseMembersOptions {
  getAccessToken: () => Promise<string | null>;
  /** False makes no calls at all. Nothing after sign-up waits on this hook (loaded lazily). */
  enabled: boolean;
  client?: MembersClient;
}

export interface UseMembersResult {
  /** The last list we got, kept in memory. Never cleared by a failed refresh. */
  view: MembersView | null;
  status: MembersStatus;
  /** Calm copy for the last failure, or null. */
  message: string | null;
  /**
   * Each action resolves true when the server accepted it, false otherwise (a failure sets `message`).
   * Nothing is queued. If the follow-up reload then fails, it still resolves true; `status` and
   * `message` report the reload, and `view` keeps the older list.
   */
  invite: (email: string) => Promise<boolean>;
  revoke: (inviteId: string) => Promise<boolean>;
  remove: (memberId: string) => Promise<boolean>;
  /** Joins the account the invitation came from. The token is used for one call and not kept. */
  accept: (inviteToken: string) => Promise<boolean>;
  refresh: () => Promise<void>;
}

export type MembersAction = 'load' | 'create' | 'revoke' | 'remove' | 'accept';

export const MEMBERS_MESSAGES = {
  offline: 'You need a connection to do this. Nothing else is affected.',
  signed_out: 'Please sign in again to do this.',
  invalid_email: "That email doesn't look right.",
  invalid: "That doesn't look right. Please check it and try again.",
  forbidden: "This isn't available for your account.",
  rate_limited: "You've sent a lot of invitations today. You can send more tomorrow.",
  conflict_create: 'That person is already invited or already helping.',
  conflict_accept: "You already have people you're helping, so this invitation can't be joined from this account.",
  unusable: "This invitation can't be used. Ask the person who sent it for a new one.",
  unavailable: "This isn't available right now. Please try again in a moment.",
} as const;

/** Maps an api-client failure to calm copy (C7). Unknown reasons read as unavailable. */
export function membersErrorMessage(reason: MembersFailureReason, action: MembersAction): string {
  switch (reason) {
    case 'offline':
      return MEMBERS_MESSAGES.offline;
    case 'signed_out':
      return MEMBERS_MESSAGES.signed_out;
    case 'invalid':
      return MEMBERS_MESSAGES.invalid;
    case 'forbidden':
      return MEMBERS_MESSAGES.forbidden;
    case 'rate_limited':
      return MEMBERS_MESSAGES.rate_limited;
    case 'conflict':
      return action === 'accept' ? MEMBERS_MESSAGES.conflict_accept : MEMBERS_MESSAGES.conflict_create;
    case 'unusable':
      return MEMBERS_MESSAGES.unusable;
    default:
      return MEMBERS_MESSAGES.unavailable;
  }
}

export function useMembers({ getAccessToken, enabled, client }: UseMembersOptions): UseMembersResult {
  const [view, setView] = useState<MembersView | null>(null);
  const [status, setStatus] = useState<MembersStatus>('idle');
  const [message, setMessage] = useState<string | null>(null);
  const mounted = useRef(true);
  const tokenRef = useRef(getAccessToken);
  const clientRef = useRef(client ?? defaultClient);
  const enabledRef = useRef(enabled);
  // A slower, older load must not overwrite a newer one.
  const loadGen = useRef(0);
  tokenRef.current = getAccessToken;
  clientRef.current = client ?? defaultClient;
  enabledRef.current = enabled;

  /** True while this hook is still mounted and switched on. Late results are dropped otherwise. */
  const isLive = () => mounted.current && enabledRef.current;

  const load = useCallback(async () => {
    if (!enabledRef.current) return;
    const g = ++loadGen.current;
    setStatus((s) => (s === 'ready' ? s : 'loading'));
    const token = await tokenRef.current();
    if (!mounted.current || g !== loadGen.current) return;
    if (!token) {
      setMessage(MEMBERS_MESSAGES.signed_out);
      setStatus('signed_out');
      return;
    }
    const result = await clientRef.current.getMembers(token);
    if (!mounted.current || g !== loadGen.current) return;
    if (result.ok) {
      setView(result.view);
      setStatus('ready');
      setMessage(null);
      return;
    }
    // The last list stays on screen.
    setMessage(membersErrorMessage(result.reason, 'load'));
    setStatus(
      result.reason === 'offline' ? 'offline' : result.reason === 'signed_out' ? 'signed_out' : 'unavailable',
    );
  }, []);

  // Tracks real unmount only, not `enabled` toggles.
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    if (enabled) {
      void load();
      return;
    }
    // Switched off (for example on sign-out): drop the last account's list and any load in flight.
    loadGen.current++;
    setView(null);
    setStatus('idle');
    setMessage(null);
  }, [enabled, load]);

  /** Runs one account action. The access token is read for the call and goes nowhere else. */
  const act = useCallback(
    async (
      action: MembersAction,
      run: (c: MembersClient, token: string) => Promise<{ ok: true } | MembersFailure>,
    ): Promise<boolean> => {
      if (!enabledRef.current) return false;
      setMessage(null);
      const token = await tokenRef.current();
      if (!token) {
        if (isLive()) {
          setMessage(MEMBERS_MESSAGES.signed_out);
          setStatus('signed_out');
        }
        return false;
      }
      const result = await run(clientRef.current, token);
      if (!result.ok) {
        if (isLive()) {
          setMessage(membersErrorMessage(result.reason, action));
          if (result.reason === 'signed_out') setStatus('signed_out');
        }
        return false;
      }
      if (isLive()) await load();
      return true;
    },
    [load],
  );

  const invite = useCallback(
    async (rawEmail: string) => {
      if (!enabledRef.current) return false;
      const email = parseInviteEmail(rawEmail);
      if (email === null) {
        setMessage(MEMBERS_MESSAGES.invalid_email);
        return false;
      }
      return act('create', (c, token) => c.createInvite(token, email));
    },
    [act],
  );

  const revoke = useCallback(
    (inviteId: string) => act('revoke', (c, token) => c.revokeInvite(token, inviteId)),
    [act],
  );
  const remove = useCallback(
    (memberId: string) => act('remove', (c, token) => c.removeMember(token, memberId)),
    [act],
  );
  const accept = useCallback(
    (inviteToken: string) => act('accept', (c, token) => c.acceptInvite(token, inviteToken)),
    [act],
  );

  return { view, status, message, invite, revoke, remove, accept, refresh: load };
}
