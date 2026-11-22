/**
 * Asks the sync for a pull at once (#949). A send screen opens and wants the web's latest Ready status.
 * The screen and the sync hook live in different parts of the tree, so this is a small event, like leftFamily.ts.
 * Nothing shows on screen (C5).
 */
type Listener = () => void;

const listeners = new Set<Listener>();

export function onFlowPullRequest(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function requestFlowPull(): void {
  for (const listener of [...listeners]) {
    listener();
  }
}
