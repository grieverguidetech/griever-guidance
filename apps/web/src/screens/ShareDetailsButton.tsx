import { useRef, useState } from 'react';
import { ShareNetwork } from '@phosphor-icons/react';
import { buildShareSnapshot } from '@griever/shared';
import type { ShareChecklistItem, ShareSessionDetails } from '@griever/shared';

interface Props {
  session: ShareSessionDetails;
  checklist: ShareChecklistItem[];
}

const COPIED = 'Copied. You can paste it into a message.';
const COULD_NOT_COPY =
  "We couldn't copy it. You can select the text below and copy it.";
const DID_NOT_GO_THROUGH = "That didn't go through.";
const MESSAGE_MS = 4000;

/** The person closed the share sheet, or it was already open: not a problem. */
function isSilentShareError(error: unknown): boolean {
  return (
    error instanceof DOMException &&
    (error.name === 'AbortError' || error.name === 'InvalidStateError')
  );
}

/**
 * Shares a plain-text, read-only snapshot through the phone's share sheet, or
 * copies it when there is no share sheet. Nothing leaves the device except
 * through the person's own choice in the OS sheet (C5).
 */
export function ShareDetailsButton({ session, checklist }: Props) {
  const [message, setMessage] = useState('');
  const [manualText, setManualText] = useState<string | null>(null);
  const sharing = useRef(false);
  const clearTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Cleared after a few seconds so a repeated message is announced again.
  function say(next: string) {
    clearTimeout(clearTimer.current);
    setMessage(next);
    clearTimer.current = setTimeout(() => setMessage(''), MESSAGE_MS);
  }

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setManualText(null);
      say(COPIED);
    } catch {
      setManualText(text);
      say(COULD_NOT_COPY);
    }
  }

  async function share() {
    if (sharing.current) return;
    sharing.current = true;
    try {
      setMessage('');
      setManualText(null);
      const { text } = buildShareSnapshot(session, checklist);

      if (typeof navigator.share !== 'function') {
        await copy(text);
        return;
      }
      try {
        // Text only: the first line already names the person, and a separate
        // title would be repeated in an email subject.
        await navigator.share({ text });
      } catch (error) {
        if (isSilentShareError(error)) return;
        // The tap has expired by now, so copying here would often be refused.
        say(DID_NOT_GO_THROUGH);
        setManualText(text);
      }
    } finally {
      sharing.current = false;
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <button type="button" onClick={share} className="gg-btn gg-btn-ghost gg-btn-block">
        <ShareNetwork size={18} weight="duotone" aria-hidden="true" />
        Share these details
      </button>
      <p
        role="status"
        aria-live="polite"
        className="text-center m-0 text-[14px]"
        style={{ color: 'var(--text-muted)' }}
      >
        {message}
      </p>
      {manualText !== null && (
        <div className="gg-field">
          <label htmlFor="share-details-text">Details to copy</label>
          <textarea
            id="share-details-text"
            className="gg-input text-[14px]"
            readOnly
            rows={10}
            value={manualText}
            onFocus={(e) => e.currentTarget.select()}
          />
        </div>
      )}
    </div>
  );
}
