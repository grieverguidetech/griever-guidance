/**
 * A member stopped helping (#224). The Account screen and the sync hook live in different parts of the
 * tree, so this tells the sync side, which holds the device's people, to drop the shared ones at once.
 */
type Listener = (userId: string) => void;

const listeners = new Set<Listener>();

export function onLeftFamily(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function announceLeftFamily(userId: string): void {
  for (const listener of [...listeners]) {
    listener(userId);
  }
}
