import { useCallback, useEffect, useRef, useState } from 'react';
import { useSessions } from '@griever/hooks';
import type { Session } from '@griever/hooks';
import { createDeviceCache } from './deviceCache';

// The key `useSessions` stores its list under, and ours for which person is open.
export const SESSIONS_KEY = 'gg.sessions.v1';
export const ACTIVE_KEY = 'gg.activeSession.v1';

export const createSessionCache = () =>
  createDeviceCache([
    { key: SESSIONS_KEY, json: true },
    { key: ACTIVE_KEY, json: false },
  ]);

// Nothing typed, nothing chosen: a person who has not been filled in yet.
export const isBlank = (s: Session) => !s.personName.trim() && Object.keys(s.drafts).length === 0;

/**
 * The same `useSessions` the web uses, over the device cache, plus which person is open.
 * There is deliberately no way to delete a person here (C9). A first blank person is made
 * on first launch so the send flow always has somewhere to keep its draft.
 */
export function useDeviceSessions(cache: ReturnType<typeof createSessionCache>) {
  const store = useSessions(cache);
  const { sessions, createSession, touchSession } = store;
  const [savedId, setSavedId] = useState(() => cache.getItem(ACTIVE_KEY));
  const active: Session | null = sessions.find((s) => s.id === savedId) ?? sessions[0] ?? null;

  const select = useCallback(
    (id: string) => {
      cache.setItem(ACTIVE_KEY, id);
      setSavedId(id);
    },
    [cache],
  );

  const created = useRef(false);
  useEffect(() => {
    if (sessions.length > 0 || created.current) return;
    created.current = true;
    select(createSession().id);
  }, [sessions.length, createSession, select]);

  const switchTo = useCallback(
    (id: string) => {
      select(id);
      touchSession(id);
    },
    [select, touchSession],
  );

  // If anyone here is still blank, "Someone else" opens them rather than adding another blank one.
  const addPerson = useCallback(() => {
    const blank = sessions.find(isBlank);
    select(blank ? blank.id : createSession().id);
  }, [sessions, createSession, select]);

  return { ...store, active, switchTo, addPerson };
}
