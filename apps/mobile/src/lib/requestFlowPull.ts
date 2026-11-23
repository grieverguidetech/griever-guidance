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

/**
 * A pull someone waits for (pull to refresh, #959). The sync hook registers one while sync is allowed;
 * screens offer a refresh only while one is registered. The answer is true when the pull worked.
 */
type ManualPull = () => Promise<boolean>;

let manualPull: ManualPull | null = null;
const manualListeners = new Set<Listener>();

export function registerManualPull(pull: ManualPull): () => void {
  manualPull = pull;
  manualListeners.forEach((listener) => listener());
  return () => {
    if (manualPull === pull) {
      manualPull = null;
      manualListeners.forEach((listener) => listener());
    }
  };
}

export function canPullNow(): boolean {
  return manualPull !== null;
}

export function subscribeCanPullNow(listener: Listener): () => void {
  manualListeners.add(listener);
  return () => {
    manualListeners.delete(listener);
  };
}

/** False when no pull is registered or it failed. Never rejects. */
export async function pullNow(): Promise<boolean> {
  if (!manualPull) {
    return false;
  }
  try {
    return await manualPull();
  } catch {
    return false;
  }
}
