import { useState } from 'react';
import { ShareNetwork } from '@phosphor-icons/react';
import { buildShareSnapshot } from '@griever/shared';
import type { ShareChecklistItem, ShareSessionDetails } from '@griever/shared';

interface Props {
  session: ShareSessionDetails;
  checklist: ShareChecklistItem[];
}

const COPIED = 'Copied. You can paste it into a message.';
const COULD_NOT_COPY = "We couldn't copy it. You can try again.";

/**
 * Shares a plain-text, read-only snapshot through the phone's share sheet, or
 * copies it when there is no share sheet. Nothing leaves the device except
 * through the person's own choice in the OS sheet (C5).
 */
export function ShareDetailsButton({ session, checklist }: Props) {
  const [message, setMessage] = useState('');

  async function share() {
    setMessage('');
    const snapshot = buildShareSnapshot(session, checklist);

    if (typeof navigator.share === 'function') {
      try {
        await navigator.share({ title: snapshot.title, text: snapshot.text });
      } catch (error) {
        // Closing the share sheet is a choice, not a problem: say nothing.
        if (error instanceof DOMException && error.name === 'AbortError') return;
        await copy(snapshot.text);
      }
      return;
    }
    await copy(snapshot.text);
  }

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setMessage(COPIED);
    } catch {
      setMessage(COULD_NOT_COPY);
    }
  }

  return (
    <div className="flex flex-col gap-1">
      <button type="button" onClick={share} className="gg-btn gg-btn-secondary gg-btn-block">
        <ShareNetwork size={18} weight="duotone" />
        Share these details
      </button>
      <p
        role="status"
        aria-live="polite"
        className="gg-reassure text-center m-0 text-[12px]"
      >
        {message}
      </p>
    </div>
  );
}
