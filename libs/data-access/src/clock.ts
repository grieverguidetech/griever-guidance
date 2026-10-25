/** An injectable clock, so tests can set the time. */
export interface Clock {
  now(): Date;
}

export const systemClock: Clock = { now: () => new Date() };

export function fixedClock(at: Date | string): Clock {
  const date = new Date(at);
  return { now: () => new Date(date) };
}
