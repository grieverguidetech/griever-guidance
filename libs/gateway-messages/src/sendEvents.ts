import type { SendEvent } from '@griever/shared';

// Resets on every process/isolate restart — intentional, not a bug (no
// durable store for send history exists yet).
const sendEvents: SendEvent[] = [];

export function recordEvent(event: SendEvent): void {
  sendEvents.unshift(event);
}

export function listEventsForUser(userId: string): SendEvent[] {
  return sendEvents.filter((e) => e.userId === userId);
}
